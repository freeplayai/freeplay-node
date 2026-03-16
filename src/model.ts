import { FreeplayConfigurationError, freeplayError } from "./errors.js";

// Note: Types in this file are used by the Thin and Encapsulated SDKs. Be
// careful about the imports added to this file. It should only include things
// you'd be okay with the Thin SDK depending on.

// This is the normalized chat message we get from the API.

type MediaType = "audio" | "video" | "image" | "file";

export type MediaSlot = {
  type: MediaType;
  placeholder_name: string;
};

export type StrictChatMessage = {
  role: "system" | "assistant" | "user" | "developer";
  content: string;
  kind?: string;
};

// System messages have a stronger type because for some providers they are passed
// as a stringly typed field.
type SystemMessage = {
  role: "system";
  content: string;
};

// ProviderMessage is a wrapper that can represent any provider (e.g. OpenAI, Anthropic, etc.)
// specific chat message. It's recommended to extend this and use a more strict type than this
// so that you can be confident that your chat message types are plumbed through correctly.
export type ProviderMessage = {
  role: string;
  content?: string | Array<Record<string, any>> | null;
  [key: string]: any;
};

// SimpleMediaMessage-compatible content block types.
// These types serialize to JSON that matches the backend's SimpleMediaMessage schema.

export type TextContentBlock = {
  type: "text";
  text: string;
};

export type ImageUrlContentBlock = {
  type: "image_url";
  url: string;
  media_type: "image";
};

export type ImageBase64ContentBlock = {
  type: "image";
  content_type: string;
  data: string;
};

export type AudioBase64ContentBlock = {
  type: "audio";
  content_type: string;
  data: string;
};

export type FileBase64ContentBlock = {
  type: "file";
  content_type: string;
  data: string;
  filename: string;
};

export type SimpleMediaContentBlock =
  | TextContentBlock
  | ImageUrlContentBlock
  | ImageBase64ContentBlock
  | AudioBase64ContentBlock
  | FileBase64ContentBlock;

// Legacy type aliases for backward compatibility
export type MediaContentUrl = ImageUrlContentBlock;
export type MediaContentBase64 =
  | ImageBase64ContentBlock
  | AudioBase64ContentBlock
  | FileBase64ContentBlock;

/**
 * @deprecated Use ProviderMessage instead.
 */
export type GenericChatMessage = ProviderMessage;

export function isSystemMessage(
  chatMessage: ProviderMessage,
): chatMessage is SystemMessage {
  return chatMessage.role === "system";
}

export type ChatMessageDict = ProviderMessage;

export type MediaInputURL = {
  type: "url";
  url: string;
};

export type MediaInputBase64 = {
  type: "base64";
  data: string;
  content_type: string;
};

export type MediaInput = MediaInputURL | MediaInputBase64;

export type MediaInputMap = Record<string, MediaInput>;

export type GeminiChatMessage = {
  role: "model" | "user";
  parts: Array<GeminiPart>;
};
export type GeminiChatPart = {
  text: string;
};
export type GeminiInlineDataPart = {
  inline_data: {
    mime_type: string;
    data: string;
  };
};
export type GeminiPart = GeminiChatPart | GeminiInlineDataPart;

export type LLMMessage = string | ProviderMessage[];

export type CustomMetadata = Record<string, string | number | boolean>;

export type RoleSupport = {
  supported: ReadonlySet<string>;
  coerceMap: Readonly<Record<string, string>>;
};

const DEFAULT_ROLE_SUPPORT: RoleSupport = {
  supported: new Set(["system", "user", "assistant"]),
  coerceMap: {},
};

const OPENAI_ROLE_SUPPORT: RoleSupport = {
  supported: new Set(["system", "user", "assistant", "tool"]),
  coerceMap: { developer: "system" },
};

const OPENAI_RESPONSES_ROLE_SUPPORT: RoleSupport = {
  supported: new Set(["system", "user", "assistant", "developer", "tool"]),
  coerceMap: {},
};

const GEMINI_ROLE_SUPPORT: RoleSupport = {
  supported: new Set(["system", "user", "assistant", "model"]),
  coerceMap: {},
};

export function prepareMessages(
  messages: ProviderMessage[],
  roleSupport: RoleSupport,
  flavorName: string,
): ProviderMessage[] {
  return messages.map((message) => {
    const role = message.role;
    if (roleSupport.supported.has(role)) {
      return message;
    }
    const coerced = roleSupport.coerceMap[role];
    if (coerced) {
      console.warn(
        `Role '${role}' is not natively supported by this flavor. Coercing to '${coerced}'.`,
      );
      return { ...message, role: coerced };
    }
    throw new FreeplayConfigurationError(
      `Role '${role}' is not supported by ${flavorName} flavor. Please update your prompt template in Freeplay to use a flavor that supports the '${role}' role.`,
    );
  });
}

// Thin requirements of a "Flavor".
interface ILLMAdapter<LLMFormat> {
  roleSupport: RoleSupport;
  provider(): string;

  toLLMSyntax(messages: ProviderMessage[]): LLMFormat;
}

export class LLMAdapters {
  static adapterForFlavor(flavor: string): ILLMAdapter<any> {
    switch (flavor) {
      case "openai_chat":
        return new OpenAILLMAdapter();
      case "anthropic_chat":
        return new AnthropicLLMAdapter();
      case "llama_3_chat":
        return new Llama3LLMAdapter();
      case "baseten_mistral_chat":
        return new BasetenMistralLLMAdapter();
      case "mistral_chat":
        return new MistralLLMAdapter();
      case "gemini_chat":
        return new GeminiLLMAdapter();
      case "gemini_api_chat":
        return new GeminiApiLLMAdapter();
      case "openai_responses":
        return new OpenAIResponsesAdapter();
      case "amazon_bedrock_converse":
        return new BedrockConverseAdapter();
      default:
        throw new FreeplayConfigurationError(
          `Unable to create LLMAdapter for name '${flavor}'.`,
        );
    }
  }
}

export class AnthropicLLMAdapter implements ILLMAdapter<ProviderMessage[]> {
  roleSupport = DEFAULT_ROLE_SUPPORT;

  provider(): string {
    return "anthropic";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => {
        if (Array.isArray(message.content)) {
          const newContent = message.content.map((item) => {
            if (item.type === "audio") {
              throw freeplayError(
                "Anthropic does not support audio or video content",
              );
            }

            if (item.type === "image_url") {
              return {
                type: "image",
                source: {
                  type: "url",
                  url: item.url,
                },
              };
            } else if (item.type === "image") {
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: item.content_type,
                  data: item.data,
                },
              };
            } else if (item.type === "file") {
              return {
                type: "document",
                source: {
                  type: "base64",
                  media_type: item.content_type,
                  data: item.data,
                },
              };
            } else if (item.type === "text") {
              return {
                type: "text",
                text: item.text,
              };
            } else {
              return item;
            }
          });

          return { ...message, content: newContent };
        }

        return message;
      });
  }
}

export class OpenAILLMAdapter implements ILLMAdapter<ProviderMessage[]> {
  roleSupport = OPENAI_ROLE_SUPPORT;

  provider(): string {
    return "openai";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages.map((message) => {
      if (Array.isArray(message.content)) {
        const newContent = message.content.map((item) => {
          if (item.type === "image_url") {
            return {
              type: "image_url",
              image_url: { url: item.url },
            };
          } else if (item.type === "image") {
            return {
              type: "image_url",
              image_url: {
                url: `data:${item.content_type};base64,${item.data}`,
              },
            };
          } else if (item.type === "audio") {
            return {
              type: "input_audio",
              input_audio: {
                data: item.data,
                format: item.content_type.split("/")[1].replace("mpeg", "mp3"),
              },
            };
          } else if (item.type === "file") {
            return {
              type: "file",
              file: {
                filename: item.filename,
                file_data: `data:${item.content_type};base64,${item.data}`,
              },
            };
          } else if (item.type === "text") {
            return {
              type: "text",
              text: item.text,
            };
          }
          return item;
        });

        return { ...message, content: newContent };
      }

      return message;
    });
  }
}

export class OpenAIResponsesAdapter implements ILLMAdapter<ProviderMessage[]> {
  roleSupport = OPENAI_RESPONSES_ROLE_SUPPORT;

  provider(): string {
    return "openai";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => {
        if (Array.isArray(message.content)) {
          const newContent = message.content.map((item) => {
            if (item.type === "text") {
              return { type: "input_text", text: item.text };
            } else if (item.type === "image_url") {
              return { type: "input_image", image_url: item.url };
            } else if (item.type === "image") {
              return {
                type: "input_image",
                image_url: `data:${item.content_type};base64,${item.data}`,
              };
            } else if (item.type === "audio") {
              throw freeplayError(
                "Audio content is not yet supported by the OpenAI Responses API.",
              );
            } else if (item.type === "file") {
              return {
                type: "input_file",
                filename: item.filename,
                file_data: `data:${item.content_type};base64,${item.data}`,
              };
            }
            return item;
          });

          return { type: "message", ...message, content: newContent };
        }

        return { type: "message", ...message };
      });
  }
}

export class Llama3LLMAdapter implements ILLMAdapter<string> {
  roleSupport = DEFAULT_ROLE_SUPPORT;

  provider(): string {
    return "sagemaker";
  }

  toLLMSyntax(messages: ProviderMessage[]): string {
    const formattedMessages = messages.map((message) => {
      return `<|start_header_id|>${message.role}<|end_header_id|>\n${message.content}<|eot_id|>`;
    });
    return `<|begin_of_text|>\n${formattedMessages.join("\n")}\n<|start_header_id|>assistant<|end_header_id|>`;
  }
}

export class BasetenMistralLLMAdapter
  implements ILLMAdapter<ProviderMessage[]>
{
  roleSupport = DEFAULT_ROLE_SUPPORT;

  provider(): string {
    return "baseten";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages;
  }
}

export class MistralLLMAdapter implements ILLMAdapter<ProviderMessage[]> {
  roleSupport = DEFAULT_ROLE_SUPPORT;

  provider(): string {
    return "bedrock";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages;
  }
}

export class GeminiLLMAdapter implements ILLMAdapter<GeminiChatMessage[]> {
  roleSupport = GEMINI_ROLE_SUPPORT;

  provider(): string {
    return "vertex";
  }

  toLLMSyntax(messages: ProviderMessage[]): GeminiChatMessage[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => {
        // Already in Gemini format (e.g., history from previous turns
        // with function calls, function responses, or multi-part content)
        if ("parts" in message && message.parts) {
          return {
            role: this.translateRole(message.role),
            parts: message.parts as GeminiPart[],
          };
        }

        if (typeof message?.content === "string") {
          return {
            role: this.translateRole(message.role),
            parts: [{ text: message.content as string }],
          };
        } else if (Array.isArray(message?.content)) {
          const parts = message.content.map((item): GeminiPart => {
            if (item.type === "image_url") {
              throw freeplayError(
                "Message contains an image URL, but image URLs are not supported by Gemini",
              );
            } else if (
              item.type === "image" ||
              item.type === "audio" ||
              item.type === "file"
            ) {
              return {
                inline_data: {
                  mime_type: item.content_type,
                  data: item.data,
                },
              };
            } else if (item.type === "text") {
              return { text: item.text };
            }

            // note this is an unsafe cast -- relies on Gemini messages being in history
            return item as GeminiPart;
          });

          return {
            role: this.translateRole(message.role),
            parts,
          };
        } else {
          // note this is an unsafe cast -- relies on Gemini messages being in history
          return message as GeminiChatMessage;
        }
      });
  }

  translateRole(role: string): GeminiChatMessage["role"] {
    switch (role) {
      case "user":
        return "user";
      case "assistant":
      case "model":
        return "model";
      default:
        throw new FreeplayConfigurationError(
          `Unknown role for Gemini prompt: ${role}.`,
        );
    }
  }
}

export class GeminiApiLLMAdapter extends GeminiLLMAdapter {
  provider(): string {
    return "gemini";
  }
}

export class BedrockConverseAdapter implements ILLMAdapter<ProviderMessage[]> {
  roleSupport = DEFAULT_ROLE_SUPPORT;

  provider(): string {
    return "bedrock";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => {
        const role = message.role;
        if (role !== "user" && role !== "assistant") {
          throw new FreeplayConfigurationError(
            `Unexpected role for Bedrock Converse flavor: ${role}`,
          );
        }

        // Handle string content
        if (typeof message.content === "string") {
          return {
            role,
            content: [{ text: message.content }],
          };
        }

        // Handle array content with potential media
        if (Array.isArray(message.content)) {
          const newContent = message.content.map((item) => {
            if (item.type === "text") {
              return { text: item.text };
            } else if (item.type === "image") {
              const formatStr = item.content_type.split("/")[1];
              return {
                image: {
                  format: formatStr,
                  source: {
                    bytes: Buffer.from(item.data, "base64"),
                  },
                },
              };
            } else if (item.type === "file") {
              const formatStr = item.content_type.split("/")[1];
              return {
                document: {
                  format: formatStr,
                  name: item.filename,
                  source: {
                    bytes: Buffer.from(item.data, "base64"),
                  },
                },
              };
            } else if (item.type === "audio") {
              throw new FreeplayConfigurationError(
                "Bedrock Converse does not support audio content",
              );
            } else if (item.type === "image_url") {
              throw new FreeplayConfigurationError(
                "Bedrock Converse does not support URL-based media content",
              );
            }

            // Pass through other content types as-is
            return item;
          });

          return {
            role,
            content: newContent,
          };
        }

        // Default: pass through content as-is
        return {
          role,
          content: message.content,
        };
      });
  }
}

// Export additional types that were previously defined in the old model.ts
export type FlavorSpecifier =
  | "openai_completion"
  | "openai_chat"
  | "azure_openai_completion"
  | "azure_openai_chat"
  | "anthropic_completion"
  | "anthropic_claude"
  | "anthropic_chat"
  | "llama_3_chat"
  | "baseten_mistral_chat"
  | "mistral_chat"
  | "gemini_chat"
  | "gemini_api_chat"
  | "openai_responses";
export type Provider =
  | "openai"
  | "azure_openai"
  | "anthropic"
  | "sagemaker"
  | "vertex"
  | "gemini"
  | "baseten"
  | "bedrock";

// Basic types
export type ApiStyle = "batch" | "default";
export type CustomFeedback = string | number | boolean;
export type InputVariables = Record<string, any>;
export type LLMParameters = Record<string, any>;
export type ProviderInfo = Record<string, any>;
export type SpanKind = "tool" | "agent";

// JSON value type for trace input/output
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

export type OpenAIFunction = Record<string, any>;
export type OpenAIFunctionCall = { arguments: string; function_name: string };
export type OpenAIToolCall = {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
};

// Output schema type aliases -- semantically meaningful to differentiate from
// provider specific Record<string, any> and Normalized format
export type NormalizedOutputSchema = Record<string, any>; // Processed JSON schema for storage
export type FormattedOutputSchema = Record<string, any>; // Processed JSON schema for storage
