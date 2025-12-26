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
  role: "system" | "assistant" | "user";
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

const hasContentPartType = (
  record: Record<string, any>,
  type: string,
): boolean =>
  "content_part_type" in record && record.content_part_type === type;

const hasMediaType = (
  record: Record<string, any>,
): record is { type: MediaType } =>
  "slot_type" in record &&
  ["audio", "video", "image", "file"].includes(record.slot_type);

const hasStringValue = (
  record: Record<string, any>,
  key: string,
): record is { content: string } =>
  key in record && typeof record[key] === "string";

export type MediaContentUrl = {
  slot_name: string;
  content_part_type: "media_url";
  url: string;
  slot_type: MediaType;
};

const isMediaContentUrl = (
  record: Record<string, any>,
): record is MediaContentUrl =>
  hasContentPartType(record, "media_url") &&
  hasMediaType(record) &&
  hasStringValue(record, "url") &&
  hasStringValue(record, "slot_name");

export type MediaContentBase64 = {
  slot_name: string;
  content_part_type: "media_base64";
  content_type: string;
  data: string;
  slot_type: MediaType;
};

const isMediaContentBase64 = (
  record: Record<string, any>,
): record is MediaContentBase64 =>
  hasContentPartType(record, "media_base64") &&
  hasMediaType(record) &&
  hasStringValue(record, "content_type") &&
  hasStringValue(record, "data") &&
  hasStringValue(record, "slot_name");

export type TextContent = {
  content_part_type: "text";
  text: string;
};

const isTextContent = (record: Record<string, any>): record is TextContent => {
  return hasContentPartType(record, "text") && hasStringValue(record, "text");
};

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

// Thin requirements of a "Flavor".
interface ILLMAdapter<LLMFormat> {
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
  provider(): string {
    return "anthropic";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages
      .filter((message) => message.role !== "system")
      .map((message) => {
        if (Array.isArray(message.content)) {
          const newContent = message.content.map((item) => {
            if (
              "slot_type" in item &&
              ["audio", "video"].includes(item.slot_type)
            ) {
              throw freeplayError(
                "Anthropic does not support audio or video content",
              );
            }

            if (isMediaContentUrl(item)) {
              return {
                type: item.slot_type === "image" ? "image" : "document",
                source: {
                  type: "url",
                  url: item.url,
                },
              };
            } else if (isMediaContentBase64(item)) {
              return {
                type: item.slot_type === "image" ? "image" : "document",
                source: {
                  type: "base64",
                  media_type: item.content_type,
                  data: item.data,
                },
              };
            } else if (isTextContent(item)) {
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
  provider(): string {
    return "openai";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages.map((message) => {
      if (Array.isArray(message.content)) {
        const newContent = message.content.map((item) => {
          if (isMediaContentUrl(item)) {
            if (item.slot_type !== "image") {
              throw freeplayError(
                "Message contains a non-image URL, but OpenAI only supports image URLs.",
              );
            }
            return {
              type: "image_url",
              image_url: { url: item.url },
            };
          } else if (isMediaContentBase64(item)) {
            return this.format_base64_content(item);
          } else if (isTextContent(item)) {
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

  private format_base64_content(item: MediaContentBase64): Record<string, any> {
    if (item.slot_type === "audio") {
      return {
        type: "input_audio",
        input_audio: {
          data: item.data,
          format: item.content_type.split("/")[1].replace("mpeg", "mp3"),
        },
      };
    } else if (item.slot_type === "file") {
      return {
        type: "file",
        file: {
          filename: `${item.slot_name}.${item.content_type.split("/")[1]}`,
          file_data: `data:${item.content_type};base64,${item.data}`,
        },
      };
    } else {
      return {
        type: "image_url",
        image_url: {
          url: `data:${item.content_type};base64,${item.data}`,
        },
      };
    }
  }
}

export class Llama3LLMAdapter implements ILLMAdapter<string> {
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
  provider(): string {
    return "baseten";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages;
  }
}

export class MistralLLMAdapter implements ILLMAdapter<ProviderMessage[]> {
  provider(): string {
    return "bedrock";
  }

  toLLMSyntax(messages: ProviderMessage[]): ProviderMessage[] {
    return messages;
  }
}

export class GeminiLLMAdapter implements ILLMAdapter<GeminiChatMessage[]> {
  provider(): string {
    return "vertex";
  }

  toLLMSyntax(messages: ProviderMessage[]): GeminiChatMessage[] {
    return messages
      .filter(
        (message) =>
          (typeof message.content === "string" ||
            Array.isArray(message.content)) &&
          message.role != "system",
      )
      .map((message) => {
        if (typeof message?.content === "string") {
          return {
            role: this.translateRole(message.role),
            parts: [{ text: message.content as string }],
          };
        } else if (Array.isArray(message?.content)) {
          const parts = message.content.map((item): GeminiPart => {
            if (isMediaContentUrl(item)) {
              throw freeplayError(
                "Message contains an image URL, but image URLs are not supported by Gemini",
              );
            } else if (isMediaContentBase64(item)) {
              return {
                inline_data: {
                  mime_type: item.content_type,
                  data: item.data,
                },
              };
            } else if (isTextContent(item)) {
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
        return "model";
      default:
        throw new FreeplayConfigurationError(
          `Unknown role for Gemini prompt: ${role}.`,
        );
    }
  }
}

export class BedrockConverseAdapter implements ILLMAdapter<ProviderMessage[]> {
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
            if (isTextContent(item)) {
              return { text: item.text };
            } else if (isMediaContentBase64(item)) {
              // Convert base64 media to Bedrock format
              const formatStr = item.content_type.split("/")[1];

              if (item.slot_type === "image") {
                return {
                  image: {
                    format: formatStr,
                    source: {
                      bytes: Buffer.from(item.data, "base64"),
                    },
                  },
                };
              } else if (item.slot_type === "file") {
                return {
                  document: {
                    format: formatStr,
                    name: item.slot_name,
                    source: {
                      bytes: Buffer.from(item.data, "base64"),
                    },
                  },
                };
              } else {
                throw new FreeplayConfigurationError(
                  `Bedrock Converse does not support ${item.slot_type} content`,
                );
              }
            } else if (isMediaContentUrl(item)) {
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
  | "gemini_chat";
export type Provider =
  | "openai"
  | "azure_openai"
  | "anthropic"
  | "sagemaker"
  | "vertex"
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

// Tool schema types for Google GenAI/Vertex AI

/**
 * Function declaration for Google GenAI API tool schema format.
 *
 * Represents a single function that can be called by the model.
 * This is the building block for GenaiTool.
 *
 * @example
 * ```typescript
 * const weatherFunction: GenaiFunction = {
 *   name: "get_weather",
 *   description: "Get the current weather for a location",
 *   parameters: {
 *     type: "object",
 *     properties: {
 *       location: {
 *         type: "string",
 *         description: "City name, e.g., 'San Francisco'"
 *       },
 *       units: {
 *         type: "string",
 *         enum: ["celsius", "fahrenheit"],
 *         description: "Temperature units"
 *       }
 *     },
 *     required: ["location"]
 *   }
 * };
 * ```
 */
export type GenaiFunction = {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
};

/**
 * Tool schema format for Google GenAI API.
 *
 * GenAI uses a different structure than OpenAI/Anthropic:
 * - A single Tool contains multiple FunctionDeclarations
 * - Same format is used by both GenAI API and Vertex AI
 *
 * This is the key difference: OpenAI/Anthropic pass tools as an array,
 * while GenAI wraps multiple functions in a single tool object.
 *
 * @example
 * ```typescript
 * // Single function
 * const toolSchema: GenaiTool[] = [
 *   {
 *     functionDeclarations: [weatherFunction]
 *   }
 * ];
 *
 * // Multiple functions in one tool (GenAI-specific feature)
 * const toolSchema: GenaiTool[] = [
 *   {
 *     functionDeclarations: [
 *       weatherFunction,
 *       newsFunction,
 *       searchFunction
 *     ]
 *   }
 * ];
 * ```
 */
export type GenaiTool = {
  functionDeclarations: GenaiFunction[];
};
