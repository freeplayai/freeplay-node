import axios from "axios";
import * as MockAdapter from "axios-mock-adapter";
import * as nock from "nock";
import { v4 as uuidv4 } from "uuid";
import { FormattedToolSchema } from "../src/support";
import { TemplateMessage } from "../src";

const getAxiosMock = (): MockAdapter =>
  new MockAdapter.default(axios, { onNoMatch: "throwException" });

const getNock = (): nock.Scope => nock("https://api.openai.com");
const getAnthropicNock = (): nock.Scope => nock("https://api.anthropic.com");

/** Server sent events are array buffers in the form...
 * data: JSON\n\n
 * data: JSON\n\n
 * This helper constructs a valid OpenAI SSE response for mocking.
 */
const buildServerSentEventPayload = (eventPayloads: object[]): Buffer => {
  let finalPayload = "";
  eventPayloads.forEach((payload) => {
    finalPayload += `data: ${JSON.stringify(payload)}\n\n`;
  });
  return Buffer.from(finalPayload, "utf-8");
};

/** Server sent events are array buffers in the form...
 * event: completion\n
 * data: JSON\n\n
 * This helper constructs a valid OpenAI SSE response for mocking.
 */
const buildAnthropicSSEPayload = (eventPayloads: object[]): Buffer => {
  let finalPayload = "";
  eventPayloads.forEach((payload) => {
    finalPayload += `event: completion\ndata: ${JSON.stringify(payload)}\n\n`;
  });
  return Buffer.from(finalPayload, "utf-8");
};

const assertChunksInAsyncGenerator = async (
  expectedChunks: object[],
  stream: AsyncGenerator,
) => {
  let index = 0;

  for await (const chunk of stream) {
    expect(chunk).toEqual(expectedChunks[index]);
    index++;
  }
};

const getRequestPayloads = (
  axiosMock: MockAdapter,
  method: string,
  url: string,
): object[] =>
  axiosMock.history[method]
    .filter((request) => request.url == url)
    .map((request) => JSON.parse(request.data));

const mockGetPrompts = ({
  axiosMock,
  projectId,
  projectVersionId,
  promptTemplateId,
  promptContent,
  environment = "latest",
  flavor_name = "openai_chat",
  model = "gpt-3.5-turbo",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  projectVersionId: string;
  promptTemplateId: string;
  promptContent: string;
  environment?: string;
  flavor_name?: string;
  model?: string;
}) =>
  axiosMock
    .onGet(
      `http://localhost:8080/api/projects/${projectId}/templates/all/${environment}`,
    )
    .reply(200, {
      templates: [
        {
          project_version_id: projectVersionId,
          prompt_template_id: promptTemplateId,
          prompt_template_version_id: projectVersionId,
          name: "my-prompt",
          content: promptContent,
          flavor_name: flavor_name,
          params: {
            model: model,
          },
        },
      ],
    });

const mockGetPromptsV2 = ({
  axiosMock,
  projectId,
  promptTemplateVersionId,
  promptTemplateId,
  promptContent,
  environment = "latest",
  flavor_name = "openai_chat",
  model = "gpt-3.5-turbo",
  provider = "openai",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  promptTemplateVersionId: string;
  promptTemplateId: string;
  promptContent: TemplateMessage[];
  environment?: string;
  flavor_name?: string;
  model?: string;
  provider?: string;
}) =>
  axiosMock
    .onGet(
      `http://localhost:8080/api/v2/projects/${projectId}/templates/all/${environment}`,
    )
    .reply(200, {
      prompt_templates: [
        {
          prompt_template_id: promptTemplateId,
          prompt_template_version_id: promptTemplateVersionId,
          prompt_template_name: "my-prompt",
          content: promptContent,
          metadata: {
            flavor: flavor_name,
            model: model,
            provider: provider,
            params: {},
            provider_info: {
              anthropic_endpoint: "https://example.com/anthropic",
            },
          },
        },
      ],
    });

const mockCreatePromptVersion = ({
  axiosMock,
  projectId,
  promptTemplateId,
  promptTemplateVersionId,
  promptTemplateName = "Test Template 1",
  promptContent = [
    {
      content: "Answer this question as concisely as you can: {{question}}",
      role: "user",
    },
  ],
  model = "claude-4-sonnet-20250514",
  provider = "anthropic",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  promptTemplateVersionId: string;
  promptTemplateId: string;
  promptTemplateName?: string;
  promptContent?: TemplateMessage[];
  environment?: string;
  flavor_name?: string;
  model?: string;
  provider?: string;
}) => {
  const response = {
    promptTemplateId: promptTemplateId,
    promptTemplateVersionId: promptTemplateVersionId,
    promptTemplateName: promptTemplateName,
    metadata: {
      provider,
      model,
    },
    formatVersion: 1,
    projectId: projectId,
    content: promptContent,
    toolSchema: null,
    versionName: "v1",
    versionDescription: null,
  };
  axiosMock
    .onPost(
      `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/name/${promptTemplateName}/versions`,
    )
    .reply(201, response);
  return response;
};

const mockGetPromptV2 = ({
  axiosMock,
  projectId,
  promptTemplateVersionId,
  promptTemplateId,
  promptTemplateName,
  promptContent,
  toolSchema,
  environment = "latest",
  flavor_name = "openai_chat",
  model = "gpt-3.5-turbo",
  provider = "openai",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  promptTemplateVersionId: string;
  promptTemplateId: string;
  promptTemplateName: string;
  promptContent: TemplateMessage[];
  toolSchema?: FormattedToolSchema[];
  environment?: string;
  flavor_name?: string;
  model?: string;
  provider?: string;
}) =>
  axiosMock
    .onGet(
      `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/name/${promptTemplateName}?environment=${environment}`,
    )
    .reply(200, {
      prompt_template_id: promptTemplateId,
      prompt_template_version_id: promptTemplateVersionId,
      prompt_template_name: promptTemplateName,
      content: promptContent,
      metadata: {
        flavor: flavor_name,
        model: model,
        provider: provider,
        params: {},
        provider_info: {
          anthropic_endpoint: "https://example.com/anthropic",
        },
      },
      project_id: projectId,
      tool_schema: toolSchema,
    });

const mockGetPromptsV2WithTimeout = ({
  axiosMock,
  projectId,
  environment = "latest",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  environment?: string;
}) =>
  axiosMock
    .onGet(
      `http://localhost:8080/api/v2/projects/${projectId}/templates/all/${environment}`,
    )
    .timeout();

const mockGetPromptVersionIdV2 = ({
  axiosMock,
  projectId,
  promptTemplateVersionId,
  promptTemplateId,
  promptTemplateName,
  promptContent,
  flavor_name = "openai_chat",
  model = "gpt-3.5-turbo",
  provider = "openai",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  promptTemplateVersionId: string;
  promptTemplateId: string;
  promptTemplateName: string;
  promptContent: TemplateMessage[];
  environment?: string;
  flavor_name?: string;
  model?: string;
  provider?: string;
}) =>
  axiosMock
    .onGet(
      `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/id/${promptTemplateId}/versions/${promptTemplateVersionId}`,
    )
    .reply(200, {
      prompt_template_id: promptTemplateId,
      prompt_template_version_id: promptTemplateVersionId,
      prompt_template_name: promptTemplateName,
      content: promptContent,
      metadata: {
        flavor: flavor_name,
        model: model,
        provider: provider,
        params: {},
        provider_info: {
          anthropic_endpoint: "https://example.com/anthropic",
        },
      },
      project_id: projectId,
    });

const mockGetPromptsNoModel = ({
  axiosMock,
  projectId,
  projectVersionId,
  promptTemplateId,
  promptContent,
  environment = "latest",
  flavor_name = "openai_chat",
}: {
  axiosMock: MockAdapter;
  projectId: string;
  projectVersionId: string;
  promptTemplateId: string;
  promptContent: string;
  environment?: string;
  flavor_name?: string;
}) =>
  axiosMock
    .onGet(
      `http://localhost:8080/api/projects/${projectId}/templates/all/${environment}`,
    )
    .reply(200, {
      templates: [
        {
          project_version_id: projectVersionId,
          prompt_template_id: promptTemplateId,
          prompt_template_version_id: projectVersionId,
          name: "my-prompt",
          content: promptContent,
          flavor_name: flavor_name,
          params: {},
        },
      ],
    });

const mockCreateTestRun = (axiosMock: MockAdapter, projectId: string) =>
  axiosMock
    .onPost(`http://localhost:8080/api/v2/projects/${projectId}/test-runs`)
    .reply((config) => {
      const requestBody = JSON.parse(config.data);
      const includeTestCasesOutputs = requestBody["include_outputs"] || false;

      const testCases = [
        {
          test_case_id: uuidv4(),
          variables: { question: "Why isn't my sink working" },
          output: includeTestCasesOutputs ? "It took PTO today" : null,
          history: [
            {
              role: "user",
              content: [{ type: "text", content: "Why isn't my sink working" }],
            },
          ],
        },
        {
          test_case_id: uuidv4(),
          variables: { question: "Why isn't my internet working" },
          output: includeTestCasesOutputs
            ? "It's playing golf with the sink"
            : null,
        },
      ];

      // Create the response object based on the includeTestCasesOutputs flag
      const response = {
        test_run_id: uuidv4(),
        test_cases: testCases,
      };

      // Return the status code and the response object
      return [201, response];
    });

const mockCreateTestRunThick = (axiosMock: MockAdapter, projectId: string) =>
  axiosMock
    .onPost(`http://localhost:8080/api/projects/${projectId}/test-runs-cases`)
    .reply((config) => {
      const requestBody = JSON.parse(config.data);
      const includeTestCasesOutputs =
        requestBody.include_test_case_outputs || false;

      const testCases = [
        {
          id: uuidv4(),
          variables: { question: "Why isn't my sink working" },
          output: includeTestCasesOutputs ? "It took PTO today" : null,
        },
        {
          id: uuidv4(),
          variables: { question: "Why isn't my internet working" },
          output: includeTestCasesOutputs
            ? "It's playing golf with the sink"
            : null,
        },
      ];

      // Create the response object based on the includeTestCasesOutputs flag
      const response = {
        test_run_id: uuidv4(),
        test_cases: testCases,
      };

      // Return the status code and the response object
      return [201, response];
    });

const mockGetTestRun = (
  axiosMock: MockAdapter,
  projectId: string,
  testRunId: string,
) => {
  axiosMock
    .onGet(
      `http://localhost:8080/api/v2/projects/${projectId}/test-runs/id/${testRunId}`,
    )
    .reply(200, {
      name: "Test Run",
      description: "Test Run Description",
      summary_statistics: {
        auto_evaluation: { key: "value" },
        human_evaluation: { key: "value" },
      },
      test_run_id: testRunId,
    });
};

const mockUpdateCustomerFeedback = (
  axiosMock: MockAdapter,
  projectId: string,
  completionId: string,
) =>
  axiosMock
    .onPost(
      `http://localhost:8080/api/v2/projects/${projectId}/completion-feedback/id/${completionId}`,
    )
    .reply(201, {});

export const mockUpdateTraceFeedback = (
  axiosMock: MockAdapter,
  projectId: string,
  traceId: string,
) =>
  axiosMock
    .onPost(
      `http://localhost:8080/api/v2/projects/${projectId}/trace-feedback/id/${traceId}`,
    )
    .reply(201, {});

const mockUpdateSessionMetadata = (
  axiosMock: MockAdapter,
  projectId: string,
  sessionId: string,
  status: number = 200,
  responseBody: object = { message: "Metadata updated successfully" },
) =>
  axiosMock
    .onPatch(
      `http://localhost:8080/api/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
    )
    .reply(status, responseBody);

const mockUpdateTraceMetadata = (
  axiosMock: MockAdapter,
  projectId: string,
  sessionId: string,
  traceId: string,
  status: number = 200,
  responseBody: object = { message: "Metadata updated successfully" },
) =>
  axiosMock
    .onPatch(
      `http://localhost:8080/api/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}/metadata`,
    )
    .reply(status, responseBody);

const mockRecordTrace = (
  axiosMock: MockAdapter,
  projectId: string,
  sessionId: string,
  traceId: string,
) =>
  axiosMock
    .onPost(
      `http://localhost:8080/api/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
    )
    .reply(201, {});

const mockRecord = (
  axiosMock: MockAdapter,
  projectId: string,
  sessionId: string,
  completionId: string,
) =>
  axiosMock
    .onPost(
      `http://localhost:8080/api/v2/projects/${projectId}/sessions/${sessionId}/completions`,
    )
    .reply(201, { completion_id: completionId });

const mockRecordUpdate = (
  axiosMock: MockAdapter,
  projectId: string,
  completionId: string,
) =>
  axiosMock
    .onPost(
      `http://localhost:8080/api/v2/projects/${projectId}/completions/${completionId}`,
    )
    .reply(201, { completion_id: completionId });

const mockDeleteSession = (
  axiosMock: MockAdapter,
  projectId: string,
  sessionId: string,
) =>
  axiosMock
    .onDelete(
      `http://localhost:8080/api/v2/projects/${projectId}/sessions/${sessionId}`,
    )
    .reply(201, {});

const describeIntegrationTest =
  process.env.RUN_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value;
};

export {
  assertChunksInAsyncGenerator,
  buildAnthropicSSEPayload,
  buildServerSentEventPayload,
  describeIntegrationTest,
  getAnthropicNock,
  getAxiosMock,
  getNock,
  getRequestPayloads,
  mockCreateTestRun,
  mockCreateTestRunThick,
  mockDeleteSession,
  mockGetPrompts,
  mockGetPromptsNoModel,
  mockGetPromptsV2,
  mockGetPromptsV2WithTimeout,
  mockGetPromptV2,
  mockGetPromptVersionIdV2,
  mockCreatePromptVersion,
  mockGetTestRun,
  mockRecord,
  mockRecordTrace,
  mockRecordUpdate,
  mockUpdateCustomerFeedback,
  mockUpdateSessionMetadata,
  mockUpdateTraceMetadata,
  requireEnv,
};
