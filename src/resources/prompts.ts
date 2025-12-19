import * as fs from "fs/promises";
import * as path from "path";
import { FreeplayConfigurationError, freeplayError } from "../errors.js";
import {
  ApiStyle,
  FlavorSpecifier,
  FormattedOutputSchema,
  InputVariables,
  isSystemMessage,
  LLMAdapters,
  LLMParameters,
  MediaContentBase64,
  MediaContentUrl,
  MediaInputMap,
  MediaSlot,
  Provider,
  ProviderInfo,
  ProviderMessage,
  StrictChatMessage,
} from "../model.js";
import {
  CallSupport,
  TemplateVersionResponse,
  FormattedToolSchema,
  PromptTemplate,
  PromptTemplates,
  ToolSchema,
} from "../support.js";
import { CallInfo, UsageTokens } from "./recordings.js";

export class Prompts {
  private readonly callSupport: CallSupport;
  private templateResolver: TemplateResolver;

  constructor(callSupport: CallSupport, templateResolver?: TemplateResolver) {
    this.callSupport = callSupport;
    this.templateResolver =
      templateResolver || new APITemplateResolver(this.callSupport);
  }

  async createVersion({
    projectId,
    promptTemplateName,
    templateMessages,
    model,
    provider,
    versionName,
    versionDescription,
    llmParameters,
    toolSchema,
    environments,
  }: {
    projectId: string;
    promptTemplateName: string;
    templateMessages: TemplateMessage[];
    model: string;
    provider: Provider;
    versionName?: string;
    versionDescription?: string;
    llmParameters?: LLMParameters;
    toolSchema?: ToolSchema[];
    environments?: string[];
  }): Promise<TemplateVersionResponse> {
    return this.callSupport.createPromptVersion(
      projectId,
      promptTemplateName,
      templateMessages,
      model,
      provider,
      versionName,
      versionDescription,
      llmParameters,
      toolSchema,
      environments,
    );
  }

  async updateVersionEnvironments({
    projectId,
    promptTemplateId,
    promptTemplateVersionId,
    environments,
  }: {
    projectId: string;
    promptTemplateId: string;
    promptTemplateVersionId: string;
    environments: string[];
  }): Promise<void> {
    return this.callSupport.updateTemplateVersionEnvironments(
      projectId,
      promptTemplateId,
      promptTemplateVersionId,
      environments,
    );
  }

  async get({
    projectId,
    templateName,
    environment,
  }: {
    projectId: string;
    templateName: string;
    environment: string;
  }): Promise<TemplatePrompt> {
    const prompt = await this.templateResolver.getPrompt(
      projectId,
      environment,
      templateName,
    );

    return this.buildTemplatePrompt(prompt, environment);
  }

  async getByVersionId({
    projectId,
    promptTemplateId,
    promptTemplateVersionId,
  }: {
    projectId: string;
    promptTemplateId: string;
    promptTemplateVersionId: string;
  }): Promise<TemplatePrompt> {
    const prompt = await this.templateResolver.getPromptByVersionId(
      projectId,
      promptTemplateId,
      promptTemplateVersionId,
    );

    return this.buildTemplatePrompt(prompt);
  }

  async getFormatted<MessageType extends ProviderMessage = ProviderMessage>({
    projectId,
    templateName,
    environment,
    variables,
    flavorName,
    media,
    history,
  }: {
    projectId: string;
    templateName: string;
    environment: string;
    variables: InputVariables;
    flavorName?: string;
    history?: MessageType[];
    media?: MediaInputMap;
  }): Promise<FormattedPrompt<MessageType>> {
    const promptTemplate = await this.get({
      projectId,
      templateName,
      environment,
    });

    return promptTemplate
      .bind(variables, history, media)
      .format<MessageType>(flavorName);
  }

  async getFormattedByVersionId({
    projectId,
    promptTemplateId,
    promptTemplateVersionId,
    variables,
    flavorName,
    media,
    history,
  }: {
    projectId: string;
    promptTemplateId: string;
    promptTemplateVersionId: string;
    variables: InputVariables;
    flavorName?: string;
    history?: ProviderMessage[];
    media?: MediaInputMap;
  }): Promise<FormattedPrompt> {
    const promptTemplate = await this.getByVersionId({
      projectId,
      promptTemplateId,
      promptTemplateVersionId,
    });

    return promptTemplate.bind(variables, history, media).format(flavorName);
  }

  private buildTemplatePrompt(
    promptTemplate: PromptTemplate,
    environment?: string,
  ): TemplatePrompt {
    if (!promptTemplate.metadata.flavor) {
      throw new FreeplayConfigurationError(
        "Flavor must be configured in the Freeplay UI. Unable to fulfill request.",
      );
    }

    const params = promptTemplate.metadata.params || {};
    const model = promptTemplate.metadata["model"]!;

    const llmAdapter = LLMAdapters.adapterForFlavor(
      promptTemplate.metadata.flavor as FlavorSpecifier,
    );

    const promptInfo = {
      promptTemplateId: promptTemplate.prompt_template_id,
      promptTemplateVersionId: promptTemplate.prompt_template_version_id,
      templateName: promptTemplate.prompt_template_name,
      environment: environment,
      modelParameters: params,
      providerInfo: promptTemplate.metadata.provider_info,
      provider: llmAdapter.provider(),
      model: model,
      flavorName: promptTemplate.metadata.flavor,
    };

    return new TemplatePrompt(
      promptInfo,
      promptTemplate.content,
      promptTemplate.tool_schema,
      promptTemplate.output_schema,
    );
  }
}

export type PromptVersionInfo = {
  promptTemplateVersionId: string;
  environment?: string;
};

export type PromptInfo = PromptVersionInfo & {
  promptTemplateId: string;
  templateName: string;
  modelParameters: LLMParameters;
  providerInfo?: ProviderInfo;
  provider: string;
  model: string;
  flavorName: string;
};

// noinspection JSUnusedGlobalSymbols
export function getCallInfo(
  promptInfo: PromptInfo,
  startTime: Date,
  endTime: Date,
  usage?: UsageTokens,
  apiStyle?: ApiStyle,
): CallInfo {
  return {
    provider: promptInfo.provider,
    model: promptInfo.model,
    startTime,
    endTime,
    modelParameters: promptInfo.modelParameters,
    providerInfo: promptInfo.providerInfo,
    usage: usage,
    apiStyle: apiStyle,
  };
}

type TemplateChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  media_slots?: MediaSlot[];
};

type HistoryTemplateMessage = {
  kind: "history";
};

export type TemplateMessage = HistoryTemplateMessage | TemplateChatMessage;

const isHistoryMessage = (
  message: TemplateMessage,
): message is HistoryTemplateMessage => {
  return "kind" in message && message.kind === "history";
};

export const extractMediaContent = (
  media: MediaInputMap,
  mediaSlots: MediaSlot[],
): (MediaContentUrl | MediaContentBase64)[] => {
  const mediaContent: (MediaContentUrl | MediaContentBase64)[] = [];
  mediaSlots.forEach((slot) => {
    const file = media[slot.placeholder_name];
    if (!file) {
      return;
    }

    mediaContent.push(
      file.type === "url"
        ? {
            slot_name: slot.placeholder_name,
            content_part_type: "media_url",
            slot_type: slot.type,
            url: file.url,
          }
        : {
            slot_name: slot.placeholder_name,
            content_part_type: "media_base64",
            content_type: file.content_type,
            slot_type: slot.type,
            data: file.data,
          },
    );
  });

  return mediaContent;
};

export class TemplatePrompt {
  promptInfo: PromptInfo;
  messages: TemplateMessage[]; // could have mustache placeholders, media slot
  toolSchema?: ToolSchema[];
  outputSchema?: Record<string, any>;

  constructor(
    promptInfo: PromptInfo,
    messages: TemplateMessage[],
    toolSchema?: ToolSchema[],
    outputSchema?: Record<string, any>,
  ) {
    this.promptInfo = promptInfo;
    this.messages = messages;
    this.toolSchema = toolSchema;
    this.outputSchema = outputSchema;
  }

  bind(
    variables: InputVariables,
    history?: ProviderMessage[],
    mediaInputs?: MediaInputMap,
  ): BoundPrompt {
    const hasHistoryPlaceholder =
      this.messages.find(isHistoryMessage) != undefined;

    if (history && !hasHistoryPlaceholder) {
      throw freeplayError(
        `History provided for template '${this.promptInfo.templateName}' that does not expect it.`,
      );
    }
    if (hasHistoryPlaceholder && history === undefined) {
      console.warn(
        `Template '${this.promptInfo.templateName}' expects history but none was provided.`,
      );
    }

    const cleanHistory: ProviderMessage[] = history
      ? history.filter((message: ProviderMessage) => message.role !== "system")
      : [];

    const boundMessages: ProviderMessage[] = this.messages.flatMap(
      (message) => {
        if (isHistoryMessage(message)) {
          return cleanHistory;
        }
        const mediaSlots: MediaSlot[] = message.media_slots ?? [];
        const mediaMap = mediaInputs ?? {};
        const mediaContent = extractMediaContent(mediaMap, mediaSlots);
        const chatMessage: StrictChatMessage = {
          role: message.role,
          content: CallSupport.renderTemplate(message["content"], variables),
        };

        if (mediaContent.length === 0) {
          return chatMessage;
        }

        return {
          role: message.role,
          content: [
            {
              content_part_type: "text",
              text: chatMessage.content,
            },
            ...mediaContent,
          ],
        };
      },
    );
    return new BoundPrompt(
      this.promptInfo,
      boundMessages,
      this.toolSchema,
      this.outputSchema,
    );
  }
}

export class BoundPrompt {
  promptInfo: PromptInfo;
  messages: ProviderMessage[];
  toolSchema?: ToolSchema[];
  outputSchema?: Record<string, any>;

  constructor(
    promptInfo: PromptInfo,
    messages: ProviderMessage[],
    toolSchema?: ToolSchema[],
    outputSchema?: Record<string, any>,
  ) {
    this.promptInfo = promptInfo;
    this.messages = messages;
    this.toolSchema = toolSchema;
    this.outputSchema = outputSchema;
  }

  private formatToolSchema(
    toolSchema: ToolSchema[],
    flavorName: string,
  ): FormattedToolSchema[] {
    if (flavorName === "anthropic_chat") {
      return toolSchema.map((schema) => ({
        name: schema.name,
        description: schema.description,
        input_schema: schema.parameters,
      }));
    } else if (["openai_chat", "azure_openai_chat"].includes(flavorName)) {
      return toolSchema.map((schema) => ({
        function: schema,
        type: "function",
      }));
    } else if (flavorName === "gemini_chat") {
      return [
        {
          functionDeclarations: toolSchema.map((schema) => ({
            name: schema.name,
            description: schema.description,
            parameters: schema.parameters,
          })),
        },
      ];
    }

    throw new FreeplayConfigurationError(
      "Tool schema not supported for this model and provider.",
    );
  }

  private formatOutputSchema(
    outputSchema: Record<string, any>,
    flavorName: string,
  ): Record<string, any> {
    // For OpenAI and Azure OpenAI, the normalized format is compatible with the API format
    if (["openai_chat", "azure_openai_chat"].includes(flavorName)) {
      return outputSchema;
    }
    // Currently only OpenAI-compatible models support output schema
    throw new FreeplayConfigurationError(
      "Structured outputs are not supported for this model and provider.",
    );
  }

  format<MessageType extends ProviderMessage = ProviderMessage>(
    flavorName?: string,
  ): FormattedPrompt<MessageType> {
    const finalFlavor = flavorName || this.promptInfo.flavorName;
    const llmAdapter = LLMAdapters.adapterForFlavor(finalFlavor);
    const llmFormat = llmAdapter.toLLMSyntax(this.messages);
    const llmFormatText = typeof llmFormat === "string" ? llmFormat : undefined;
    const formattedToolSchema = this.toolSchema
      ? this.formatToolSchema(this.toolSchema, finalFlavor)
      : undefined;
    const formattedOutputSchema = this.outputSchema
      ? this.formatOutputSchema(this.outputSchema, finalFlavor)
      : undefined;

    if (llmFormatText) {
      return new FormattedPrompt<MessageType>(
        this.promptInfo,
        this.messages as MessageType[],
        undefined,
        llmFormatText,
        formattedToolSchema,
        formattedOutputSchema,
      );
    } else {
      return new FormattedPrompt<MessageType>(
        this.promptInfo,
        this.messages as MessageType[],
        llmFormat,
        undefined,
        formattedToolSchema,
        formattedOutputSchema,
      );
    }
  }
}

export class FormattedPrompt<
  MessageType extends ProviderMessage = ProviderMessage,
> {
  /**
   * messages is for internal state tracking, use llmPrompt to retrieve the correct messages to send to the LLM.
   */
  private messages: MessageType[];

  promptInfo: PromptInfo;
  llmPrompt?: MessageType[];
  llmPromptText?: string;
  systemContent?: string;
  toolSchema?: FormattedToolSchema[];
  outputSchema?: FormattedOutputSchema;

  constructor(
    promptInfo: PromptInfo,
    messages: MessageType[],
    formattedPrompt?: MessageType[],
    formattedPromptText?: string,
    toolSchema?: FormattedToolSchema[],
    outputSchema?: FormattedOutputSchema,
  ) {
    this.messages = messages;
    this.promptInfo = promptInfo;
    this.llmPrompt = formattedPrompt;
    this.llmPromptText = formattedPromptText;
    this.toolSchema = toolSchema;
    this.outputSchema = outputSchema;
    this.systemContent = messages.find(isSystemMessage)?.content as
      | string
      | undefined;
  }

  allMessages(newMessage: MessageType): MessageType[] {
    return [...this.messages, newMessage];
  }
}

export interface TemplateResolver {
  getPrompts(projectId: string, environment: string): Promise<PromptTemplates>;

  getPrompt(
    projectId: string,
    environment: string,
    name: string,
  ): Promise<PromptTemplate>;

  getPromptByVersionId(
    projectId: string,
    promptTemplateId: string,
    promptTemplateVersionId: string,
  ): Promise<PromptTemplate>;
}

export class APITemplateResolver implements TemplateResolver {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  getPrompts(projectId: string, environment: string): Promise<PromptTemplates> {
    return this.callSupport.getPrompts(projectId, environment);
  }

  getPrompt(
    projectId: string,
    environment: string,
    name: string,
  ): Promise<PromptTemplate> {
    return this.callSupport.getPrompt(projectId, environment, name);
  }

  getPromptByVersionId(
    projectId: string,
    promptTemplateId: string,
    promptTemplateVersionId: string,
  ): Promise<PromptTemplate> {
    return this.callSupport.getPromptByVersionId(
      projectId,
      promptTemplateId,
      promptTemplateVersionId,
    );
  }
}

// noinspection JSUnusedGlobalSymbols
export class FilesystemTemplateResolver implements TemplateResolver {
  private readonly freeplayDirectory: string;

  constructor(freeplayDirectory: string) {
    this.freeplayDirectory = freeplayDirectory;
  }

  async getPrompts(
    projectId: string,
    environment: string,
  ): Promise<PromptTemplates> {
    const environmentDirectory = await this.validateDirectories(
      projectId,
      environment,
    );

    const files: string[] = await fs.readdir(environmentDirectory);

    const prompts: Array<PromptTemplate> = [];
    for (const filename of files) {
      const template = await this.fileToTemplateObject(
        path.resolve(environmentDirectory, filename),
      );
      prompts.push(template);
    }

    return { prompt_templates: prompts };
  }

  async getPrompt(
    projectId: string,
    environment: string,
    name: string,
  ): Promise<PromptTemplate> {
    const environmentDirectory = await this.validateDirectories(
      projectId,
      environment,
    );
    const expectedFile = path.resolve(environmentDirectory, `${name}.json`);

    try {
      return await this.fileToTemplateObject(expectedFile);
    } catch {
      throw freeplayError(
        `Cannot find template ${name} in project (${projectId}) in ` +
          `environment (${environment}).`,
      );
    }
  }

  async getPromptByVersionId(
    projectId: string,
    promptTemplateId: string,
    promptTemplateVersionId: string,
  ): Promise<PromptTemplate> {
    await this.validateFreeplayDirectory(this.freeplayDirectory);

    const promptDirectory = path.resolve(
      this.freeplayDirectory,
      "freeplay",
      "prompts",
      projectId,
    );
    const jsonFilePaths = await this.getAllJsonFilePaths(promptDirectory);

    for (const filePath of jsonFilePaths) {
      const template = await this.fileToTemplateObject(filePath);
      if (
        template.prompt_template_id === promptTemplateId &&
        template.prompt_template_version_id === promptTemplateVersionId
      ) {
        return template;
      }
    }

    throw freeplayError(
      `Cannot file version id ${promptTemplateVersionId} for ${promptTemplateId} in local filesystem`,
    );
  }

  private async fileToTemplateObject(
    filePath: string,
  ): Promise<PromptTemplate> {
    const text = await fs.readFile(filePath, "utf-8");
    const promptJson = JSON.parse(text);

    if ("format_version" in promptJson && promptJson.format_version >= 2) {
      return {
        prompt_template_id: promptJson.prompt_template_id as string,
        prompt_template_version_id:
          promptJson.prompt_template_version_id as string,
        prompt_template_name: promptJson.prompt_template_name as string,
        content: promptJson.content,
        metadata: {
          model: promptJson.metadata.model,
          provider: promptJson.metadata.provider,
          params: promptJson.metadata.params,
          flavor: promptJson.metadata.flavor,
        },
      };
    } else {
      const llmAdapter = LLMAdapters.adapterForFlavor(
        promptJson.metadata.flavor_name,
      );
      const model = promptJson.metadata.params.model;
      delete promptJson.metadata.params.model;

      const originalContent = JSON.parse(promptJson.content);
      const normalizedContent: TemplateMessage[] = originalContent.map(
        (message: StrictChatMessage) => {
          return {
            role: this.translateRole(message.role),
            content: message.content,
          };
        },
      );

      return {
        prompt_template_id: promptJson.prompt_template_id as string,
        prompt_template_version_id:
          promptJson.prompt_template_version_id as string,
        prompt_template_name: promptJson.name as string,
        content: normalizedContent,
        metadata: {
          model: model,
          provider: llmAdapter.provider(),
          params: promptJson.metadata.params,
          flavor: promptJson.metadata.flavor_name,
        },
      };
    }
  }

  private translateRole(role: string): string {
    // If you think you need a change here, be sure to check the server as the translations must match. Once we have
    // all the SDKs and all customers on the new common format, this translation can go away.
    switch (role) {
      case "Assistant":
        return "assistant";
      case "Human":
        return "user"; // Don't think we ever store this, but in case...
      default:
        return role;
    }
  }

  private async validateDirectories(
    projectId: string,
    environment: string,
  ): Promise<string> {
    await this.validateFreeplayDirectory(this.freeplayDirectory);

    const environmentDirectory = path.resolve(
      this.freeplayDirectory,
      "freeplay",
      "prompts",
      projectId,
      environment,
    );
    await this.validateEnvironmentDirectory(
      environmentDirectory,
      projectId,
      environment,
    );
    return environmentDirectory;
  }

  private async validateFreeplayDirectory(freeplayDirectory: string) {
    try {
      await fs.lstat(freeplayDirectory);
    } catch (e: any) {
      throw new FreeplayConfigurationError(
        `Specified Freeplay directory is not a valid directory. (${freeplayDirectory})`,
        e,
      );
    }

    try {
      const subDirectory = path.resolve(
        freeplayDirectory,
        "freeplay",
        "prompts",
      );
      await fs.lstat(subDirectory);
    } catch (e: any) {
      throw new FreeplayConfigurationError(
        `Specified Freeplay directory does not appear to be a Freeplay directory. (${freeplayDirectory})`,
        e,
      );
    }
  }

  private async validateEnvironmentDirectory(
    promptsDirectory: string,
    projectId: string,
    environment: string,
  ) {
    try {
      await fs.lstat(promptsDirectory);
    } catch (e: any) {
      throw new FreeplayConfigurationError(
        `Cannot find project (${projectId}) or environment (${environment}) in the Freeplay directory.`,
        e,
      );
    }
  }

  private async getAllJsonFilePaths(dir: string): Promise<string[]> {
    const files = await fs.readdir(dir, { withFileTypes: true });
    let jsonFiles: string[] = [];
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        jsonFiles = jsonFiles.concat(await this.getAllJsonFilePaths(fullPath)); // Recursive call for directories
      } else if (file.name.endsWith(".json")) {
        jsonFiles.push(fullPath); // Collect JSON file paths
      }
    }
    return jsonFiles;
  }
}
