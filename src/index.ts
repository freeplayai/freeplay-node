import { CustomerFeedback } from "./resources/customerFeedback.js";
import { Prompts, TemplateResolver } from "./resources/prompts.js";
import { Recordings } from "./resources/recordings.js";
import { Sessions } from "./resources/sessions.js";
import { TestRuns } from "./resources/testRuns.js";
import { CallSupport } from "./support.js";

class Freeplay {
  readonly customerFeedback: CustomerFeedback;
  readonly prompts: Prompts;
  readonly recordings: Recordings;
  readonly sessions: Sessions;
  readonly testRuns: TestRuns;

  private readonly callSupport: CallSupport;

  constructor({
    freeplayApiKey,
    baseUrl,
    templateResolver,
  }: {
    freeplayApiKey: string;
    baseUrl: string;
    templateResolver?: TemplateResolver;
  }) {
    this.callSupport = new CallSupport(freeplayApiKey, baseUrl);

    this.customerFeedback = new CustomerFeedback(this.callSupport);
    this.prompts = new Prompts(this.callSupport, templateResolver);
    this.recordings = new Recordings(this.callSupport);
    this.sessions = new Sessions(this.callSupport);
    this.testRuns = new TestRuns(this.callSupport);
  }
}

export default Freeplay;

export * from "./errors.js";
export * from "./model.js";
export * from "./support.js";
export * from "./resources/customerFeedback.js";
export * from "./resources/prompts.js";
export * from "./resources/recordings.js";
export * from "./resources/sessions.js";
export * from "./resources/testRuns.js";
