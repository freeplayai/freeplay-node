import { v4 as uuidv4 } from "uuid";
import {
  ApiStyle,
  CustomMetadata,
  FormattedOutputSchema,
  InputVariables,
  LLMParameters,
  MediaInputMap,
  OpenAIFunctionCall,
  ProviderInfo,
  ProviderMessage,
} from "../model.js";
import { FormattedToolSchema, CallSupport } from "../support.js";
import { PromptVersionInfo } from "./prompts.js";

export class Recordings {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  async create(recordData: RecordPayload): Promise<RecordResponse> {
    if (recordData.traceInfo) {
      console.warn(
        "DEPRECATED: traceInfo in RecordPayload is deprecated and will be removed in v0.6.0. Use parentId instead.",
      );
    }

    // Apply default sessionInfo if not provided
    const recordDataWithDefaults = {
      ...recordData,
      sessionInfo: recordData.sessionInfo || {
        sessionId: uuidv4(),
        customMetadata: undefined,
      },
    } satisfies Required<Pick<RecordPayload, "sessionInfo">> & RecordPayload;

    const completionId = await this.callSupport.recordCall(
      recordDataWithDefaults,
    );
    return {
      completionId,
    };
  }

  async update(recordUpdateData: RecordUpdatePayload): Promise<RecordResponse> {
    const completionId =
      await this.callSupport.recordUpdateCall(recordUpdateData);
    return {
      completionId,
    };
  }
}

// Record data model
export type RecordResponse = {
  completionId: string;
};

export type UsageTokens = {
  promptTokens: number;
  completionTokens: number;
};

export type CallInfo = {
  provider?: string;
  model?: string;
  startTime?: Date;
  endTime?: Date;
  modelParameters?: LLMParameters;
  providerInfo?: ProviderInfo;
  usage?: UsageTokens;
  apiStyle?: ApiStyle;
};

export type ResponseInfo = {
  isComplete: boolean;
  functionCallResponse?: OpenAIFunctionCall;
  promptTokens?: number;
  responseTokens?: number;
};

export type TestRunInfo = {
  testRunId: string;
  testCaseId: string;
};

export type SessionInfo = {
  sessionId: string;
  customMetadata?: CustomMetadata;
};

export type TraceInfo = {
  traceId: string;
};

export type RecordPayload = {
  projectId: string;
  allMessages: ProviderMessage[];
  sessionInfo?: SessionInfo;
  inputs?: InputVariables;
  promptVersionInfo?: PromptVersionInfo;
  callInfo?: CallInfo;
  completionId?: string;
  mediaInputs?: MediaInputMap;
  responseInfo?: ResponseInfo;
  testRunInfo?: TestRunInfo;
  evalResults?: Record<string, number | boolean>;
  parentId?: string;
  /** @deprecated Use parentId instead. Will be removed in v0.6.0 */
  traceInfo?: TraceInfo;
  toolSchema?: FormattedToolSchema[];
  outputSchema?: FormattedOutputSchema;
};

export type RecordUpdatePayload = {
  projectId: string;
  completionId: string;
  newMessages: ProviderMessage[];
  evalResults?: Record<string, number | boolean>;
};
