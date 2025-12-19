import { CustomFeedback } from "../model.js";
import { CallSupport } from "../support.js";

export class CustomerFeedback {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  async update({
    projectId,
    completionId,
    customerFeedback,
  }: {
    projectId: string;
    completionId: string;
    customerFeedback: Record<string, CustomFeedback>;
  }): Promise<void> {
    await this.callSupport.recordCompletionFeedback(
      projectId,
      completionId,
      customerFeedback,
    );
  }

  async updateTrace({
    projectId,
    traceId,
    customerFeedback,
  }: {
    projectId: string;
    traceId: string;
    customerFeedback: Record<string, CustomFeedback>;
  }): Promise<void> {
    await this.callSupport.recordTraceFeedback(
      projectId,
      traceId,
      customerFeedback,
    );
  }
}
