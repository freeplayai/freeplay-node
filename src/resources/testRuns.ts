import { freeplayError } from "../errors.js";
import { InputVariables, MediaInputBase64, ProviderMessage } from "../model.js";
import { CallSupport } from "../support.js";
import { TestRunInfo } from "./recordings.js";

export class TestRuns {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  async create({
    projectId,
    testList,
    includeOutputs,
    name,
    description,
    flavorName,
    targetEvaluationIds,
  }: {
    projectId: string;
    testList: string;
    includeOutputs?: boolean;
    name?: string;
    description?: string;
    flavorName?: string;
    targetEvaluationIds?: string[];
  }): Promise<TestRun> {
    try {
      const response = await this.callSupport.httpPost(
        `v2/projects/${projectId}/test-runs`,
        {
          dataset_name: testList,
          include_outputs: includeOutputs ?? false,
          test_run_name: name,
          test_run_description: description,
          flavor_name: flavorName,
          target_evaluation_ids: targetEvaluationIds,
        },
      );

      const testRunId = response.data["test_run_id"];
      let testCases: CompletionTestCase[] | undefined = undefined;
      let tracesTestCases: TraceTestCase[] | undefined = undefined;

      if (
        response.data["test_cases"] &&
        response.data["test_cases"].length > 0
      ) {
        testCases = response.data["test_cases"].map(
          (testCase: {
            test_case_id: string;
            variables: InputVariables;
            output?: string;
            history: ProviderMessage[];
            custom_metadata?: Record<string, string>;
            media_variables?: Record<string, MediaInputBase64>;
          }) => ({
            id: testCase.test_case_id,
            variables: testCase.variables,
            output: testCase.output,
            history: testCase.history,
            customMetadata: testCase.custom_metadata,
            mediaVariables: testCase.media_variables,
          }),
        );
      }
      if (
        response.data["trace_test_cases"] &&
        response.data["trace_test_cases"].length > 0
      ) {
        tracesTestCases = response.data["trace_test_cases"].map(
          (testCase: {
            test_case_id: string;
            input: string;
            output?: string;
            custom_metadata?: Record<string, string>;
          }) => ({
            id: testCase.test_case_id,
            input: testCase.input,
            output: testCase.output,
            customMetadata: testCase.custom_metadata,
          }),
        );
      }

      if (testCases?.length && tracesTestCases?.length) {
        throw freeplayError(
          "Test cases and trace test cases cannot both be present.",
        );
      }

      return new TestRun({
        testRunId,
        testCases,
        tracesTestCases,
      });
    } catch (error: any) {
      throw freeplayError("Unable to create test run.", error);
    }
  }

  async get({
    projectId,
    testRunId,
  }: {
    projectId: string;
    testRunId: string;
  }): Promise<TestRunResults> {
    try {
      const response = await this.callSupport.httpGet(
        `v2/projects/${projectId}/test-runs/id/${testRunId}`,
      );

      const name = response.data["name"];
      const description = response.data["description"];
      const summaryStatistics = response.data["summary_statistics"];
      const apiTestRunId = response.data["test_run_id"];

      return { name, description, testRunId: apiTestRunId, summaryStatistics };
    } catch (error: any) {
      throw freeplayError("Unable to get test run.", error);
    }
  }
}

export class TestRun {
  readonly testRunId: string;
  private _testCases: CompletionTestCase[];
  private _tracesTestCases: TraceTestCase[];

  constructor(data: {
    testRunId: string;
    testCases?: CompletionTestCase[];
    tracesTestCases?: TraceTestCase[];
  }) {
    this.testRunId = data.testRunId;
    this._testCases = data.testCases ?? [];
    this._tracesTestCases = data.tracesTestCases ?? [];
  }

  private mustNotBeBoth(): void {
    if (
      this._testCases &&
      this._testCases.length > 0 &&
      this._tracesTestCases &&
      this._tracesTestCases.length > 0
    ) {
      throw freeplayError(
        "Test case and trace test case cannot both be present",
      );
    }
  }

  get testCases(): CompletionTestCase[] {
    this.mustNotBeBoth();

    if (this._tracesTestCases && (this._tracesTestCases?.length ?? 0) > 0) {
      throw freeplayError(
        "Completion test cases are not present. Please use `tracesTestCases` instead.",
      );
    }

    return this._testCases;
  }

  get tracesTestCases(): TraceTestCase[] {
    this.mustNotBeBoth();

    if (this._testCases && (this._testCases?.length ?? 0) > 0) {
      throw freeplayError(
        "Trace test cases are not present. Please use `testCases` instead.",
      );
    }

    return this._tracesTestCases;
  }
}

export function getTestRunInfo(
  testRun: TestRun,
  testCaseId: string,
): TestRunInfo {
  return {
    testRunId: testRun.testRunId,
    testCaseId: testCaseId,
  };
}

/**
 * @deprecated Use CompletionTestCase instead.
 */
export type TestCase = CompletionTestCase;

export type CompletionTestCase = {
  id: string;
  variables: InputVariables;
  output: string | null;
  history: ProviderMessage[] | null;
  customMetadata?: Record<string, string>;
  mediaVariables?: Record<string, MediaInputBase64>;
};

export type TraceTestCase = {
  id: string;
  input: string;
  output: string | null;
  customMetadata?: Record<string, string>;
};

type SummaryStatistics = {
  auto_evaluation: { [key: string]: any };
  human_evaluation: { [key: string]: any };
};

export type TestRunResults = {
  readonly name: string;
  readonly description: string;
  readonly testRunId: string;
  readonly summaryStatistics: SummaryStatistics;
};
