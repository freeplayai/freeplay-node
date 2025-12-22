import axios, { AxiosResponse } from "axios";
import * as Mustache from "mustache";
import { v4 as uuidv4 } from "uuid";
import { FreeplayClientError, freeplayError } from "./errors.js";
import {
  CustomFeedback,
  CustomMetadata,
  InputVariables,
  JSONValue,
  LLMParameters,
  NormalizedOutputSchema,
  Provider,
  SpanKind,
} from "./model.js";
import { TemplateMessage } from "./resources/prompts";
import {
  RecordPayload,
  RecordUpdatePayload,
  TestRunInfo,
} from "./resources/recordings.js";
import { getUserAgent } from "./utils.js";

export class CallSupport {
  private readonly freeplayApiKey: string;
  private readonly freeplayURL: string;

  private readonly axiosConfig: {
    headers: { Authorization: string; "User-Agent": string };
  };

  constructor(freeplayApiKey: string, apiBase: string) {
    this.freeplayApiKey = freeplayApiKey;
    this.freeplayURL = apiBase;
    this.axiosConfig = {
      headers: {
        Authorization: `Bearer ${this.freeplayApiKey}`,
        "User-Agent": getUserAgent(),
      },
    };
  }

  private static containsBuffers(obj: any): boolean {
    /**
     * Check if an object contains Buffers that need conversion.
     */
    if (Buffer.isBuffer(obj)) {
      return true;
    } else if (obj instanceof Uint8Array) {
      // Buffers are Uint8Arrays
      return true;
    } else if (Array.isArray(obj)) {
      return obj.some((item) => CallSupport.containsBuffers(item));
    } else if (obj && typeof obj === "object") {
      return Object.values(obj).some((value) =>
        CallSupport.containsBuffers(value),
      );
    }
    return false;
  }

  createSessionId(): string {
    return String(uuidv4());
  }

  async createPromptVersion(
    projectId: string,
    promptTemplateName: string,
    templateMessages: Record<string, any>[],
    model: string,
    provider: Provider,
    versionName?: string,
    versionDescription?: string,
    llmParameters?: LLMParameters,
    toolSchema?: ToolSchema[],
    environments?: string[],
  ): Promise<TemplateVersionResponse> {
    const url = `v2/projects/${projectId}/prompt-templates/name/${encodeURIComponent(promptTemplateName)}/versions`;
    const body = {
      template_messages: templateMessages,
      model,
      provider,
      version_name: versionName,
      version_description: versionDescription,
      llm_parameters: llmParameters,
      tool_schema: toolSchema,
      environments,
    };

    try {
      const response = await this.httpPost(url, body);
      return response.data;
    } catch (e: any) {
      throw freeplayError(
        `Unable to create prompt template version for prompt template ${promptTemplateName} in project ${projectId} `,
        e,
      );
    }
  }

  async updateTemplateVersionEnvironments(
    projectId: string,
    promptTemplateId: string,
    promptTemplateVersionId: string,
    environments: string[],
  ): Promise<void> {
    const url = `v2/projects/${projectId}/prompt-templates/id/${promptTemplateId}/versions/${promptTemplateVersionId}/environments`;
    try {
      await this.httpPost(url, { environments });
    } catch (e: any) {
      throw freeplayError(
        `Unable to update environments for prompt template version ${promptTemplateVersionId} in project ${projectId} `,
        e,
      );
    }
  }

  async getPrompts(
    projectId: string,
    environment: string,
  ): Promise<PromptTemplates> {
    const url = `v2/projects/${projectId}/prompt-templates/all/${encodeURIComponent(environment)}`;

    try {
      const response = await this.httpGet(url);
      return response.data;
    } catch (e: any) {
      throw freeplayError(
        `Unable to retrieve prompt templates for project ${projectId} ` +
          `in environment ${environment}.`,
        e,
      );
    }
  }

  async getPrompt(
    projectId: string,
    environment: string,
    name: string,
  ): Promise<PromptTemplate> {
    const url = `v2/projects/${projectId}/prompt-templates/name/${encodeURIComponent(name)}?environment=${encodeURIComponent(environment)}`;

    try {
      const response = await this.httpGet(url);
      return response.data;
    } catch (e: any) {
      throw freeplayError(
        `Unable to retrieve prompt template for project ${projectId} ` +
          `in environment ${environment} with name ${name}.`,
        e,
      );
    }
  }

  async getPromptByVersionId(
    projectId: string,
    promptTemplateId: string,
    promptTemplateVersionId: string,
  ): Promise<PromptTemplate> {
    const url = `v2/projects/${projectId}/prompt-templates/id/${promptTemplateId}/versions/${promptTemplateVersionId}`;

    try {
      const response = await this.httpGet(url);
      return response.data;
    } catch (e: any) {
      throw freeplayError(
        `Unable to retrieve prompt template version id ${promptTemplateVersionId} for template ${promptTemplateId} ` +
          `in project ${projectId}.`,
        e,
      );
    }
  }

  async recordCompletionFeedback(
    projectId: string,
    completionId: string,
    feedback: Record<string, CustomFeedback>,
  ): Promise<AxiosResponse> {
    CallSupport.validateBasicMap(feedback);

    const feedbackURL = `v2/projects/${projectId}/completion-feedback/id/${completionId}`;
    try {
      return await this.httpPost(feedbackURL, feedback);
    } catch (e: any) {
      throw freeplayError(
        `Unable to update customer feedback for completion ${completionId}.`,
        e,
      );
    }
  }

  async recordTraceFeedback(
    projectId: string,
    traceId: string,
    feedback: Record<string, CustomFeedback>,
  ): Promise<AxiosResponse> {
    CallSupport.validateBasicMap(feedback);

    const feedbackURL = `v2/projects/${projectId}/trace-feedback/id/${traceId}`;
    try {
      return await this.httpPost(feedbackURL, feedback);
    } catch (e: any) {
      throw freeplayError(
        `Unable to update trace feedback for project ${projectId} and trace ${traceId}.`,
        e,
      );
    }
  }

  async recordCall(
    payload: RecordPayload & Required<Pick<RecordPayload, "sessionInfo">>,
  ): Promise<string> {
    const recordAPIPath = `v2/projects/${payload.projectId}/sessions/${payload.sessionInfo.sessionId}/completions`;

    if (payload.allMessages.length == 0) {
      throw freeplayError(
        "No messages passed in to record. " +
          "There must be at least a single message, which is the LLM response.",
      );
    }

    // Convert messages if using Bedrock provider or if messages contain Buffers
    let messages = payload.allMessages;
    const needsConversion =
      (payload.callInfo && payload.callInfo.provider === "bedrock") ||
      payload.allMessages.some((msg) => CallSupport.containsBuffers(msg));

    // Use JSON stringify/parse with a replacer to handle Buffers if needed
    if (needsConversion) {
      messages = JSON.parse(
        JSON.stringify(payload.allMessages, (_, value) => {
          // Handle actual Buffer instances (though these are usually already converted by toJSON)
          if (Buffer.isBuffer(value)) {
            return value.toString("base64");
          } else if (value instanceof Uint8Array) {
            return Buffer.from(value).toString("base64");
          }
          // Handle Buffer's toJSON output format {type: "Buffer", data: [...]}
          else if (
            value &&
            typeof value === "object" &&
            value.type === "Buffer" &&
            Array.isArray(value.data)
          ) {
            return Buffer.from(value.data).toString("base64");
          }
          return value;
        }),
      );
    }

    const apiPayload: any = {
      completion_id: payload.completionId,
      messages: messages,
      ...(payload.inputs && { inputs: payload.inputs }),
      ...(payload.mediaInputs && { media_inputs: payload.mediaInputs }),
    };

    if (payload.promptVersionInfo) {
      apiPayload.prompt_info = {
        environment: payload.promptVersionInfo.environment,
        prompt_template_version_id:
          payload.promptVersionInfo.promptTemplateVersionId,
      };
    }

    if (payload.callInfo) {
      apiPayload.call_info = {
        ...(payload.callInfo.startTime && {
          start_time: payload.callInfo.startTime.getTime() / 1000,
        }),
        ...(payload.callInfo.endTime && {
          end_time: payload.callInfo.endTime.getTime() / 1000,
        }),
        ...(payload.callInfo.model && { model: payload.callInfo.model }),
        ...(payload.callInfo.provider && {
          provider: payload.callInfo.provider,
        }),
        ...(payload.callInfo.providerInfo && {
          provider_info: payload.callInfo.providerInfo,
        }),
        ...(payload.callInfo.modelParameters && {
          llm_parameters: payload.callInfo.modelParameters,
        }),
        ...(payload.callInfo.usage && {
          usage: {
            prompt_tokens: payload.callInfo.usage.promptTokens,
            completion_tokens: payload.callInfo.usage.completionTokens,
          },
        }),
        ...(payload.callInfo.apiStyle && {
          api_style: payload.callInfo.apiStyle,
        }),
      };
    }

    Object.assign(apiPayload, {
      ...(payload.toolSchema && {
        tool_schema: payload.toolSchema,
      }),
      ...(payload.outputSchema && {
        output_schema: payload.outputSchema,
      }),
      ...(payload.sessionInfo?.customMetadata && {
        session_info: { custom_metadata: payload.sessionInfo.customMetadata },
      }),
      ...(payload.responseInfo?.functionCallResponse && {
        response_info: {
          function_call_response: payload.responseInfo.functionCallResponse,
        },
      }),
      ...(payload.testRunInfo && {
        test_run_info: {
          test_run_id: payload.testRunInfo.testRunId,
          test_case_id: payload.testRunInfo.testCaseId,
        },
      }),
      ...(payload.evalResults && { eval_results: payload.evalResults }),
      ...(payload.parentId && { parent_id: payload.parentId }),
      ...(payload.traceInfo?.traceId && {
        trace_info: { trace_id: payload.traceInfo.traceId },
      }),
    });

    try {
      const response = await axios.post(
        `${this.freeplayURL}/${recordAPIPath}`,
        apiPayload,
        this.axiosConfig,
      );
      return response.data["completion_id"];
    } catch (e: any) {
      throw freeplayError("Unable to record LLM call.", e);
    }
  }

  async recordUpdateCall(payload: RecordUpdatePayload): Promise<string> {
    const recordUpdateAPIPath = `v2/projects/${payload.projectId}/completions/${payload.completionId}`;

    // Only convert messages if they contain Buffers (we don't have provider info for updates)
    let newMessages = payload.newMessages;
    if (payload.newMessages.some((msg) => CallSupport.containsBuffers(msg))) {
      newMessages = JSON.parse(
        JSON.stringify(payload.newMessages, (_, value) => {
          // Handle actual Buffer instances (though these are usually already converted by toJSON)
          if (Buffer.isBuffer(value)) {
            return value.toString("base64");
          } else if (value instanceof Uint8Array) {
            return Buffer.from(value).toString("base64");
          }
          // Handle Buffer's toJSON output format {type: "Buffer", data: [...]}
          else if (
            value &&
            typeof value === "object" &&
            value.type === "Buffer" &&
            Array.isArray(value.data)
          ) {
            return Buffer.from(value.data).toString("base64");
          }
          return value;
        }),
      );
    }

    const apiPayload = {
      new_messages: newMessages,
      eval_results: payload.evalResults,
    };

    try {
      const response = await axios.post(
        `${this.freeplayURL}/${recordUpdateAPIPath}`,
        apiPayload,
        this.axiosConfig,
      );
      return response.data["completion_id"];
    } catch (e: any) {
      throw freeplayError("Unable to record update to LLM call.", e);
    }
  }

  async recordTrace(
    projectId: string,
    sessionId: string,
    traceId: string,
    input: JSONValue,
    output: JSONValue,
    agentName?: string,
    customMetadata?: CustomMetadata,
    evalResults?: Record<string, number | boolean>,
    testRunInfo?: TestRunInfo,
    parentId?: string,
    kind?: SpanKind,
    name?: string,
    startTime?: Date,
    endTime?: Date,
  ): Promise<AxiosResponse> {
    const url = `v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`;
    const body = {
      input: input,
      output: output,
      agent_name: agentName,
      parent_id: parentId,
      custom_metadata: customMetadata,
      eval_results: evalResults,
      ...(testRunInfo && {
        test_run_info: {
          test_run_id: testRunInfo.testRunId,
          test_case_id: testRunInfo.testCaseId,
        },
      }),
      kind: kind,
      name: name,
      start_time: startTime?.toISOString(),
      end_time: endTime?.toISOString(),
    };

    try {
      return await this.httpPost(url, body);
    } catch (e: any) {
      throw freeplayError(
        `Unable to record trace output for project ${projectId}, session ${sessionId}, trace ${traceId}.`,
        e,
      );
    }
  }

  async deleteSession(
    projectId: string,
    sessionId: string,
  ): Promise<AxiosResponse> {
    const url = `v2/projects/${projectId}/sessions/${sessionId}`;
    try {
      return this.httpDelete(url);
    } catch (e: any) {
      throw freeplayError(
        `Unable to delete session ${sessionId} for project ${projectId}.`,
        e,
      );
    }
  }

  async updateSessionMetadata(
    projectId: string,
    sessionId: string,
    metadata: CustomMetadata,
  ): Promise<void> {
    const url = `v2/projects/${projectId}/sessions/id/${sessionId}/metadata`;
    try {
      await this.httpPatch(url, metadata);
    } catch (e: any) {
      throw freeplayError(
        `Unable to update session metadata for session ${sessionId} in project ${projectId}`,
        e,
      );
    }
  }

  async updateTraceMetadata(
    projectId: string,
    sessionId: string,
    traceId: string,
    metadata: CustomMetadata,
  ): Promise<void> {
    const url = `v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}/metadata`;
    try {
      await this.httpPatch(url, metadata);
    } catch (e: any) {
      throw freeplayError(
        `Unable to update trace metadata for trace ${traceId} in project ${projectId}`,
        e,
      );
    }
  }

  async httpGet<R = any>(url: string): Promise<AxiosResponse<R>> {
    return await axios.get(`${this.freeplayURL}/${url}`, this.axiosConfig);
  }

  async httpPost<D = any, R = any>(
    url: string,
    body: D,
  ): Promise<AxiosResponse<R>> {
    return await axios.post(
      `${this.freeplayURL}/${url}`,
      body,
      this.axiosConfig,
    );
  }

  // noinspection JSUnusedGlobalSymbols
  async httpPut<D = any, R = any>(
    url: string,
    body: D,
  ): Promise<AxiosResponse<R>> {
    return await axios.put(
      `${this.freeplayURL}/${url}`,
      body,
      this.axiosConfig,
    );
  }

  async httpDelete<R = any>(url: string): Promise<AxiosResponse<R>> {
    return axios.delete(`${this.freeplayURL}/${url}`, this.axiosConfig);
  }

  async httpPatch<D = any, R = any>(
    url: string,
    body: D,
  ): Promise<AxiosResponse<R>> {
    return await axios.patch(
      `${this.freeplayURL}/${url}`,
      body,
      this.axiosConfig,
    );
  }

  static validateBasicMap(metadata: Record<string, CustomFeedback>): void {
    for (const [key, value] of Object.entries(metadata)) {
      // noinspection SuspiciousTypeOfGuard
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new FreeplayClientError(
          `Invalid value for key '${key}': Value must be a string, number or boolean.`,
        );
      }
    }
  }

  static renderTemplate(template: string, variables: InputVariables): string {
    // We do not support functions or caller defined templates right now.
    CallSupport.assertIsInputVariables(variables);

    // Mustache is exporting CJS and ESM and Typescript types differently. Be very careful.
    // The mustache import behaves differently in different environments, so we must check for
    // the existence of the render function in different ways. We also have to obfuscate how we call
    // the render function to avoid an import error in some environments, like Next.js.
    // TL;DR - WE MUST PERFORM ALCHEMY WITH THE STRINGS IN ORDER TO FOOL THE MACHINE GODS
    let render = (Mustache as any)["ren" + "der"];
    if (render === undefined) {
      render = (Mustache as any)["default"]["ren" + "der"];
    }

    if (typeof render !== "function") {
      throw new FreeplayClientError("Could not find Mustache.render function");
    }

    return render(
      template,
      variables,
      {},
      {
        escape: (v: any) => {
          if (Array.isArray(v) || typeof v === "object") {
            return JSON.stringify(v);
          }
          return v;
        },
      },
    );
  }

  static assertIsInputVariables(variables: any) {
    if (typeof variables !== "object" || variables === null) {
      throw new FreeplayClientError("InputVariables must be an object");
    }

    for (const [key, value] of Object.entries(variables)) {
      if (!CallSupport.isInputVariable(value)) {
        throw new FreeplayClientError(
          `Invalid type for key ${key}, got type ${typeof value}`,
        );
      }
    }
  }

  static isInputVariable(value: any): boolean {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return true;
    }

    if (Array.isArray(value)) {
      return value.every(CallSupport.isInputVariable);
    }

    if (typeof value === "object" && value !== null) {
      return Object.values(value).every(CallSupport.isInputVariable);
    }

    return false;
  }
}

export interface PromptTemplates {
  prompt_templates: PromptTemplate[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type FormattedToolSchema = any;

export interface PromptTemplate {
  prompt_template_id: string;
  prompt_template_version_id: string;
  prompt_template_name: string;
  metadata: PromptTemplateMetadata;
  content: TemplateMessage[];
  tool_schema?: ToolSchema[];
  output_schema?: NormalizedOutputSchema;
}

export interface PromptTemplateMetadata {
  provider?: string;
  flavor?: string;
  model?: string;
  params?: Record<string, any>;
  provider_info?: Record<string, any>;
}

export interface TemplateVersionResponse {
  prompt_template_id: string;
  prompt_template_version_id: string;
  prompt_template_name: string;
  version_name?: string;
  version_description?: string | null;
  metadata?: PromptTemplateMetadata;
  format_version: number;
  project_id: string;
  content: TemplateMessage[];
  tool_schema?: ToolSchema[] | null;
}
