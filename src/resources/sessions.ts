import { freeplayError } from "../errors.js";
import { CustomMetadata, JSONValue, SpanKind } from "../model.js";
import { CallSupport } from "../support.js";
import { SessionInfo, TestRunInfo } from "./recordings.js";

export class Trace {
  sessionId: string;
  traceId: string;
  input?: JSONValue;
  agentName?: string;
  kind?: SpanKind;
  name?: string;
  parentId?: string;
  customMetadata?: CustomMetadata;
  startTime: Date;
  private callSupport: CallSupport;

  constructor(
    callSupport: CallSupport,
    sessionId: string,
    traceId: string,
    input?: JSONValue,
    agentName?: string,
    customMetadata?: CustomMetadata,
    parentId?: string,
    kind?: SpanKind,
    name?: string,
    startTime?: Date,
  ) {
    this.callSupport = callSupport;
    this.sessionId = sessionId;
    this.traceId = traceId;
    this.input = input;
    this.agentName = agentName;
    this.customMetadata = customMetadata;
    this.parentId = parentId;
    this.callSupport = callSupport;
    this.kind = kind;
    this.name = name;
    this.startTime = startTime ?? new Date();
  }

  async recordOutput(
    projectId: string,
    output: JSONValue,
    evalResults?: Record<string, number | boolean>,
    testRunInfo?: TestRunInfo,
    endTime?: Date,
  ): Promise<void> {
    if (!this.input) {
      throw freeplayError(
        `Input is required to record output for trace ${this.traceId}`,
      );
    }
    await this.callSupport.recordTrace(
      projectId,
      this.sessionId,
      this.traceId,
      this.input,
      output,
      this.agentName,
      this.customMetadata,
      evalResults,
      testRunInfo,
      this.parentId,
      this.kind,
      this.name,
      this.startTime,
      endTime ?? new Date(),
    );
  }
}

export class Sessions {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  create(createSessionPayload?: CreateSessionPayload): Session {
    return new Session(
      this.callSupport,
      this.callSupport.createSessionId(),
      createSessionPayload?.customMetadata,
    );
  }

  async delete(projectId: string, sessionId: string): Promise<void> {
    await this.callSupport.deleteSession(projectId, sessionId);
  }

  restoreSession(sessionId: string, customMetadata?: CustomMetadata): Session {
    if (customMetadata) {
      return new Session(this.callSupport, sessionId, customMetadata);
    } else {
      return new Session(this.callSupport, sessionId);
    }
  }
}

type CreateSessionPayload = {
  customMetadata?: CustomMetadata;
};

type CreateTracePayload = {
  input: JSONValue;
  kind?: SpanKind;
  agentName?: string;
  parentId?: string;
  name?: string;
  customMetadata?: CustomMetadata;
};

export class Session {
  sessionId: string;
  customMetadata?: CustomMetadata;
  callSupport: CallSupport;

  constructor(
    callSupport: CallSupport,
    sessionId: string,
    customMetadata?: CustomMetadata,
  ) {
    this.callSupport = callSupport;
    this.sessionId = sessionId;
    this.customMetadata = customMetadata;
  }

  createTrace(input: string | CreateTracePayload): Trace {
    if (typeof input === "string") {
      return new Trace(
        this.callSupport,
        this.sessionId,
        this.callSupport.createSessionId(),
        input,
        undefined,
        undefined,
        undefined,
      );
    } else if (typeof input === "object") {
      return new Trace(
        this.callSupport,
        this.sessionId,
        this.callSupport.createSessionId(),
        input.input,
        input.agentName,
        input.customMetadata,
        input.parentId,
        input.kind,
        input.name,
      );
    }
    throw freeplayError(`Invalid input: ${input}`);
  }

  restoreTrace(traceId: string, input?: string | CreateTracePayload): Trace {
    if (typeof input === "string" || input === undefined) {
      return new Trace(this.callSupport, this.sessionId, traceId, input);
    } else if (typeof input === "object") {
      return new Trace(
        this.callSupport,
        this.sessionId,
        traceId,
        input.input,
        input.agentName,
        input.customMetadata,
        input.parentId,
        input.kind,
        input.name,
      );
    }

    throw freeplayError(`Invalid input: ${input}`);
  }
}

export function getSessionInfo(session: Session): SessionInfo {
  // Note: these types match exactly today, but may not in the future. Expose method to enable decoupling.
  return session;
}
