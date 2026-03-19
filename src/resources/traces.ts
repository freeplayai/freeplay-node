import { freeplayError } from "../errors.js";
import { JSONValue } from "../model.js";
import { CallSupport } from "../support.js";

export type TraceUpdatePayload = {
  projectId: string;
  sessionId: string;
  traceId: string;
  output?: JSONValue;
  evalResults?: Record<string, number | boolean>;
};

export class Traces {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  async update(payload: TraceUpdatePayload): Promise<void> {
    if (payload.output === undefined && payload.evalResults === undefined) {
      throw freeplayError(
        "At least one of 'output' or 'evalResults' must be provided",
      );
    }
    await this.callSupport.updateTrace(
      payload.projectId,
      payload.sessionId,
      payload.traceId,
      payload.output,
      payload.evalResults,
    );
  }
}
