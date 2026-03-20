import { freeplayError } from "../errors.js";
import { CustomMetadata, JSONValue } from "../model.js";
import { CallSupport } from "../support.js";

/**
 * Test run info for trace updates.
 * Named `TraceTestRunInfo` to avoid conflict with `TestRunInfo` exported from recordings.
 */
export type TraceTestRunInfo = {
  testRunId: string;
  testCaseId: string;
};

export type TraceUpdatePayload = {
  projectId: string;
  sessionId: string;
  traceId: string;
  output?: JSONValue;
  metadata?: CustomMetadata;
  feedback?: Record<string, string | number | boolean>;
  evalResults?: Record<string, number | boolean>;
  testRunInfo?: TraceTestRunInfo;
};

export class Traces {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  async update(payload: TraceUpdatePayload): Promise<void> {
    if (
      payload.output == null &&
      payload.metadata == null &&
      payload.feedback == null &&
      payload.evalResults == null &&
      payload.testRunInfo == null
    ) {
      throw freeplayError(
        "At least one of 'output', 'metadata', 'feedback', 'evalResults', or 'testRunInfo' must be provided",
      );
    }
    await this.callSupport.updateTrace(
      payload.projectId,
      payload.sessionId,
      payload.traceId,
      payload.output,
      payload.metadata,
      payload.feedback,
      payload.evalResults,
      payload.testRunInfo,
    );
  }
}
