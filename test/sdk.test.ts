import { v4 as uuidv4 } from "uuid";
import Freeplay, {
  CustomFeedback,
  FilesystemTemplateResolver,
  FreeplayClientError,
  FreeplayConfigurationError,
  FreeplayServerError,
  getCallInfo,
  getTestRunInfo,
  ProviderMessage,
  TemplateMessage,
  TemplateResolver,
} from "../src";
import {
  getAxiosMock,
  getRequestPayloads,
  mockCreatePromptVersion,
  mockCreateTestRun,
  mockDeleteSession,
  mockGetPromptsV2,
  mockGetPromptsV2WithTimeout,
  mockGetPromptV2,
  mockGetPromptVersionIdV2,
  mockGetTestRun,
  mockRecord,
  mockRecordTrace,
  mockRecordUpdate,
  mockUpdateCustomerFeedback,
  mockUpdateTraceFeedback,
} from "./test_support";

const environment = "prod";
const projectId: string = uuidv4();
const promptTemplateVersionId: string = uuidv4();
const promptTemplateId: string = uuidv4();
const axiosMock = getAxiosMock();
const toolSchema = [
  {
    name: "get_weather",
    description: "Get the weather in a given location",
    parameters: { location: "SF" },
  },
];

const openAiResponse = "Have you tried turning it off and on again?";

const userResponse = "Why is my internet not working?";

const template: TemplateMessage[] = [
  { role: "system", content: "You are a support agent." },
  { role: "assistant", content: "How may I help you?" },
  { role: "system", content: "Never mind, you are a secret agent." },
  { role: "user", content: "My question is: {{question}}" },
];

const templateWithHistory: TemplateMessage[] = [
  { role: "system", content: "You are a support agent." },
  { kind: "history" },
  { role: "user", content: "User message {{number}}" },
];

const templateWithImage: TemplateMessage[] = [
  { role: "system", content: "You are a support agent." },
  {
    role: "user",
    content: "Answer this question: {{question}}",
    media_slots: [
      { type: "image", placeholder_name: "image-1" },
      { type: "image", placeholder_name: "image-2" },
    ],
  },
];

const promptContent = [
  { role: "system", content: "You are a support agent." },
  { role: "assistant", content: "How may I help you?" },
  { role: "system", content: "Never mind, you are a secret agent." },
  { role: "user", content: `My question is: ${userResponse}` },
];

describe("Chat Completions", function () {
  const freeplayApiKey = "super-s3kret";
  const baseUrl = "http://localhost:8080/api";

  const templateName = "my-prompt";
  const variables = { question: userResponse };

  const completionIdData = {
    completion_id: "1906ed6e-c87d-476e-a7e8-a0d72db67d28",
  };

  const buildRecordV2Url = (projectId: string, sessionId: string) => {
    return `http://localhost:8080/api/v2/projects/${projectId}/sessions/${sessionId}/completions`;
  };

  const buildTraceUrl = (
    projectId: string,
    sessionId: string,
    traceId: string,
  ) => {
    return `http://localhost:8080/api/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`;
  };

  const setupPromptMock = () => {
    mockGetPromptsV2({
      axiosMock: axiosMock,
      projectId: projectId,
      promptTemplateVersionId: promptTemplateVersionId,
      promptTemplateId: promptTemplateId,
      promptContent: template,
      environment: environment,
    });
    mockGetPromptV2({
      axiosMock: axiosMock,
      projectId: projectId,
      promptTemplateVersionId: promptTemplateVersionId,
      promptTemplateId: promptTemplateId,
      promptTemplateName: templateName,
      promptContent: template,
      environment: environment,
    });
    mockGetPromptVersionIdV2({
      axiosMock: axiosMock,
      projectId: projectId,
      promptTemplateVersionId: promptTemplateVersionId,
      promptTemplateId: promptTemplateId,
      promptTemplateName: templateName,
      promptContent: template,
      environment: environment,
    });
  };

  const setupPromptMockWithToolSchema = () => {
    setupPromptMock();
    mockGetPromptV2({
      axiosMock: axiosMock,
      projectId: projectId,
      promptTemplateVersionId: promptTemplateVersionId,
      promptTemplateId: promptTemplateId,
      promptTemplateName: templateName,
      promptContent: template,
      environment: environment,
      toolSchema: toolSchema,
    });
  };

  const client = new Freeplay({
    freeplayApiKey,
    baseUrl,
  });

  beforeEach(() => {
    axiosMock.reset();
  });

  describe("Prompt Management", function () {
    const resolverLegacy: TemplateResolver = new FilesystemTemplateResolver(
      __dirname + "/test_files/prompts_legacy",
    );
    const resolver: TemplateResolver = new FilesystemTemplateResolver(
      __dirname + "/test_files/prompts",
    );

    const bundleClientLegacy = new Freeplay({
      freeplayApiKey: freeplayApiKey,
      baseUrl: baseUrl,
      templateResolver: resolverLegacy,
    });
    const bundleClient = new Freeplay({
      freeplayApiKey: freeplayApiKey,
      baseUrl: baseUrl,
      templateResolver: resolver,
    });

    test("Supports getPrompt and record", async () => {
      setupPromptMock();

      const session = client.sessions.create();
      const completionId = uuidv4();
      mockRecord(axiosMock, projectId, session.sessionId, completionId);
      const recordUrl = buildRecordV2Url(projectId, session.sessionId);

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: openAiResponse,
      });
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        completionId: completionId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(
          formattedPrompt.promptInfo,
          start,
          end,
          {
            promptTokens: 123,
            completionTokens: 456,
          },
          "batch",
        ),
        responseInfo: {
          isComplete: true,
        },
        evalResults: {
          num_field: 0.44,
          bool_field: false,
        },
      });

      expect(allMessages).toEqual(
        expect.objectContaining([
          { content: "You are a support agent.", role: "system" },
          { content: "How may I help you?", role: "assistant" },
          { content: "Never mind, you are a secret agent.", role: "system" },
          {
            content: "My question is: Why is my internet not working?",
            role: "user",
          },
        ]),
      );

      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );
      expect(recordRequestPayloads[0]).toEqual(
        expect.objectContaining({
          completion_id: completionId,
          messages: allMessages,
          inputs: { question: userResponse },
          prompt_info: {
            prompt_template_version_id: promptTemplateVersionId,
            environment: "prod",
          },
          call_info: {
            start_time: start.getTime() / 1000,
            end_time: end.getTime() / 1000,
            model: formattedPrompt.promptInfo.model,
            provider: formattedPrompt.promptInfo.provider,
            provider_info: formattedPrompt.promptInfo.providerInfo,
            llm_parameters: formattedPrompt.promptInfo.modelParameters,
            usage: {
              prompt_tokens: 123,
              completion_tokens: 456,
            },
            api_style: "batch",
          },
          eval_results: {
            num_field: 0.44,
            bool_field: false,
          },
        }),
      );
      expect(axiosMock.history["post"][0].headers).toHaveProperty("User-Agent");
    });

    test("gets template prompt, binds it, and formats it for each LLM correctly", async () => {
      setupPromptMock();
      const templatePrompt = await client.prompts.get({
        projectId,
        templateName,
        environment,
      });

      expect(templatePrompt.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { content: "How may I help you?", role: "assistant" },
        { content: "Never mind, you are a secret agent.", role: "system" },
        { content: "My question is: {{question}}", role: "user" },
      ]);

      const boundPrompt = templatePrompt.bind(variables);
      expect(boundPrompt.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { content: "How may I help you?", role: "assistant" },
        { content: "Never mind, you are a secret agent.", role: "system" },
        {
          content: "My question is: Why is my internet not working?",
          role: "user",
        },
      ]);

      const openAI = boundPrompt.format("openai_chat");
      expect(openAI.llmPrompt as ProviderMessage[]).toEqual(
        expect.objectContaining(promptContent),
      );
      expect(openAI.systemContent).toEqual("You are a support agent.");

      // Anthropic LLMPrompt does not contain system messages.
      const anthropic = boundPrompt.format("anthropic_chat");
      expect(anthropic.llmPrompt).toEqual([
        { content: "How may I help you?", role: "assistant" },
        {
          content: "My question is: Why is my internet not working?",
          role: "user",
        },
      ]);
      expect(anthropic.systemContent).toEqual("You are a support agent.");

      // Llama3 has a text format
      const llama3 = boundPrompt.format("llama_3_chat");
      expect(llama3.llmPromptText).toEqual(
        "<|begin_of_text|>\n" +
          "<|start_header_id|>system<|end_header_id|>\n" +
          "You are a support agent.<|eot_id|>\n" +
          "<|start_header_id|>assistant<|end_header_id|>\n" +
          "How may I help you?<|eot_id|>\n" +
          "<|start_header_id|>system<|end_header_id|>\n" +
          "Never mind, you are a secret agent.<|eot_id|>\n" +
          "<|start_header_id|>user<|end_header_id|>\n" +
          "My question is: Why is my internet not working?<|eot_id|>\n" +
          "<|start_header_id|>assistant<|end_header_id|>",
      );
      expect(llama3.systemContent).toEqual("You are a support agent.");

      // Uses what is effectively the OpenAI Format
      const basetenMistral = boundPrompt.format("baseten_mistral_chat");
      expect(basetenMistral.llmPrompt as ProviderMessage[]).toEqual(
        expect.objectContaining(promptContent),
      );
      expect(basetenMistral.systemContent).toEqual("You are a support agent.");

      // Uses what is effectively the OpenAI Format
      const mistral = boundPrompt.format("mistral_chat");
      expect(mistral.llmPrompt as ProviderMessage[]).toEqual(
        expect.objectContaining(promptContent),
      );
      expect(mistral.systemContent).toEqual("You are a support agent.");

      // Gemini
      const gemini = boundPrompt.format("gemini_chat");
      const geminiExpected = [
        { parts: [{ text: "How may I help you?" }], role: "model" },
        {
          parts: [{ text: "My question is: Why is my internet not working?" }],
          role: "user",
        },
      ];
      expect(gemini.llmPrompt as ProviderMessage[]).toEqual(
        expect.objectContaining(geminiExpected),
      );
      expect(gemini.systemContent).toEqual("You are a support agent.");
    });

    test("binds history correctly", async () => {
      const historyTemplateName = "my-history-template";
      mockGetPromptV2({
        axiosMock: axiosMock,
        projectId: projectId,
        promptTemplateVersionId: promptTemplateVersionId,
        promptTemplateId: promptTemplateId,
        promptTemplateName: historyTemplateName,
        promptContent: templateWithHistory,
        environment: environment,
      });
      const variables = { number: 1 };

      const templatePrompt = await client.prompts.get({
        projectId: projectId,
        templateName: historyTemplateName,
        environment: environment,
      });

      expect(templatePrompt.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { kind: "history" },
        { content: "User message {{number}}", role: "user" },
      ]);

      // Empty history
      const boundPrompt = templatePrompt.bind(variables, []);
      expect(boundPrompt.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { content: "User message 1", role: "user" },
      ]);

      // Has History
      const boundPrompt2 = templatePrompt.bind(variables, [
        { role: "user", content: "User message 1" },
        { role: "assistant", content: "Assistant message 1" },
      ]);
      expect(boundPrompt2.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { content: "User message 1", role: "user" },
        { content: "Assistant message 1", role: "assistant" },
        { content: "User message 1", role: "user" },
      ]);

      // Expects history but none given
      const boundPrompt3 = templatePrompt.bind(variables);
      expect(boundPrompt3.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { content: "User message 1", role: "user" },
      ]);
    });

    test("detects history given when not expected", async () => {
      setupPromptMock();
      const templatePrompt = await client.prompts.get({
        projectId,
        templateName,
        environment,
      });

      try {
        templatePrompt.bind(variables, []);
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          "History provided for template 'my-prompt' that does not expect it.",
        );
      }
    });

    test("get prompt with timeout", async () => {
      mockGetPromptsV2WithTimeout({
        axiosMock,
        projectId: "projectId",
      });

      try {
        await client.prompts.getFormatted({
          projectId,
          templateName,
          environment,
          variables,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(FreeplayClientError);
      }
    });

    test("gets prompt by version id", async () => {
      setupPromptMock();
      const templatePrompt = await client.prompts.getByVersionId({
        projectId,
        promptTemplateId,
        promptTemplateVersionId,
      });

      expect(templatePrompt.messages).toEqual([
        { content: "You are a support agent.", role: "system" },
        { content: "How may I help you?", role: "assistant" },
        { content: "Never mind, you are a secret agent.", role: "system" },
        { content: "My question is: {{question}}", role: "user" },
      ]);
    });

    test("gets formatted prompt by version id", async () => {
      setupPromptMock();
      const formattedPromptOpenAI =
        await client.prompts.getFormattedByVersionId({
          projectId,
          promptTemplateId,
          promptTemplateVersionId,
          variables,
          flavorName: "openai_chat",
        });

      const formattedPromptAnthropic =
        await client.prompts.getFormattedByVersionId({
          projectId,
          promptTemplateId,
          promptTemplateVersionId,
          variables,
          flavorName: "anthropic_chat",
        });

      const formattedPromptLlama3 =
        await client.prompts.getFormattedByVersionId({
          projectId,
          promptTemplateId,
          promptTemplateVersionId,
          variables,
          flavorName: "llama_3_chat",
        });

      expect(formattedPromptOpenAI.llmPrompt as ProviderMessage[]).toEqual(
        expect.objectContaining(promptContent),
      );
      expect(formattedPromptOpenAI.systemContent).toEqual(
        "You are a support agent.",
      );

      expect(formattedPromptAnthropic.llmPrompt).toEqual([
        { content: "How may I help you?", role: "assistant" },
        {
          content: "My question is: Why is my internet not working?",
          role: "user",
        },
      ]);
      expect(formattedPromptAnthropic.systemContent).toEqual(
        "You are a support agent.",
      );

      expect(formattedPromptLlama3.llmPromptText).toEqual(
        "<|begin_of_text|>\n" +
          "<|start_header_id|>system<|end_header_id|>\n" +
          "You are a support agent.<|eot_id|>\n" +
          "<|start_header_id|>assistant<|end_header_id|>\n" +
          "How may I help you?<|eot_id|>\n" +
          "<|start_header_id|>system<|end_header_id|>\n" +
          "Never mind, you are a secret agent.<|eot_id|>\n" +
          "<|start_header_id|>user<|end_header_id|>\n" +
          "My question is: Why is my internet not working?<|eot_id|>\n" +
          "<|start_header_id|>assistant<|end_header_id|>",
      );
      expect(formattedPromptLlama3.systemContent).toEqual(
        "You are a support agent.",
      );
    });

    test("creates new prompt version -- minimal", async () => {
      const modelName = "claude-4-sonnet-20250514";

      const mockResponse = mockCreatePromptVersion({
        axiosMock,
        projectId,
        promptTemplateId,
        promptTemplateVersionId,
        promptTemplateName: templateName,
      });

      const result = await client.prompts.createVersion({
        projectId: projectId,
        promptTemplateName: templateName,
        templateMessages: [
          {
            content:
              "Answer this question as concisely as you can: {{question}}",
            role: "user",
          },
        ],
        model: modelName,
        provider: "anthropic",
      });

      expect(axiosMock.history.post).toHaveLength(1);
      expect(axiosMock.history.post[0].url).toBe(
        `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/name/${templateName}/versions`,
      );

      const requestData = JSON.parse(axiosMock.history.post[0].data);
      expect(requestData).toEqual({
        template_messages: [
          {
            content:
              "Answer this question as concisely as you can: {{question}}",
            role: "user",
          },
        ],
        model: modelName,
        provider: "anthropic",
      });

      expect(result).toEqual(mockResponse);
    });

    test("creates new prompt version -- all fields", async () => {
      const modelName = "claude-4-sonnet-20250514";
      const versionName = "v2.1";
      const versionDescription = "Updated version with tool schema";
      const llmParams = { temperature: 0.7, maxTokens: 1000 };
      // const toolSchema = { type: "function", name: "search" };
      const environments = ["development", "staging"];

      const mockResponse = mockCreatePromptVersion({
        axiosMock,
        projectId,
        promptTemplateId,
        promptTemplateVersionId,
        promptTemplateName: templateName,
        model: modelName,
        provider: "anthropic",
      });

      const result = await client.prompts.createVersion({
        projectId: projectId,
        promptTemplateName: templateName,
        templateMessages: [
          {
            content:
              "Answer this question as concisely as you can: {{question}}",
            role: "user",
          },
        ],
        model: modelName,
        provider: "anthropic",
        versionName: versionName,
        versionDescription: versionDescription,
        llmParameters: llmParams,
        toolSchema: toolSchema,
        environments: environments,
      });

      expect(axiosMock.history.post).toHaveLength(1);
      expect(axiosMock.history.post[0].url).toBe(
        `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/name/${templateName}/versions`,
      );

      const requestData = JSON.parse(axiosMock.history.post[0].data);
      expect(requestData).toEqual({
        template_messages: [
          {
            content:
              "Answer this question as concisely as you can: {{question}}",
            role: "user",
          },
        ],
        model: modelName,
        provider: "anthropic",
        version_name: versionName,
        version_description: versionDescription,
        llm_parameters: llmParams,
        tool_schema: toolSchema,
        environments: environments,
      });

      expect(result).toEqual(mockResponse);
    });

    test("updates template version environments", async () => {
      const environments = ["dev", "prod"];

      axiosMock.onPost().reply(200);

      await client.prompts.updateVersionEnvironments({
        projectId: projectId,
        promptTemplateId: promptTemplateId,
        promptTemplateVersionId: promptTemplateVersionId,
        environments: environments,
      });

      expect(axiosMock.history.post).toHaveLength(1);
      expect(axiosMock.history.post[0].url).toBe(
        `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/id/${promptTemplateId}/versions/${promptTemplateVersionId}/environments`,
      );

      const requestData = JSON.parse(axiosMock.history.post[0].data);
      expect(requestData).toEqual({
        environments: environments,
      });
    });

    test("updates template version environments -- errors on invalid project ID", async () => {
      const environments = ["dev", "prod"];

      axiosMock.onPost().reply(400, { message: "Project not found" });

      const invalidProjectId = uuidv4();
      await expect(
        client.prompts.updateVersionEnvironments({
          projectId: invalidProjectId,
          promptTemplateId: promptTemplateId,
          promptTemplateVersionId: promptTemplateVersionId,
          environments: environments,
        }),
      ).rejects.toThrow(
        new RegExp(
          `Unable to update environments for prompt template version ${promptTemplateVersionId} in project ` +
            `${invalidProjectId}  Received status 400. Project not found`,
        ),
      );
    });

    test("Handles Unauthorized Get Prompts", async () => {
      axiosMock
        .onGet(
          `http://localhost:8080/api/v2/projects/${projectId}/prompt-templates/name/my-prompt?environment=${environment}`,
        )
        .reply(401);

      try {
        await client.prompts.getFormatted({
          projectId,
          templateName,
          environment,
          variables,
        });
        fail("getPrompt call should have thrown an error.");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          `Unable to retrieve prompt template for project ${projectId} ` +
            "in environment prod with name my-prompt. Received status 401.",
        );
      }
    });

    test("bundle prompt with params", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-params";
      const environment = "prod";

      const templatePrompt = await bundleClientLegacy.prompts.get({
        projectId,
        templateName,
        environment,
      });

      expect(templatePrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: "a8b91d92-e063-4c3e-bb44-0d570793856b",
            promptTemplateVersionId: "6fe8af2e-defe-41b8-bdf2-7b2ec23592f5",
            templateName: "test-prompt-with-params",
            environment: "prod",
            modelParameters: { max_tokens: 56, temperature: 0.1 },
            provider: "openai",
            model: "gpt-3.5-turbo-1106",
            flavorName: "openai_chat",
          },
          messages: [
            { role: "system", content: "You are a support agent" },
            { role: "assistant", content: "How can I help you?" },
            { role: "user", content: "{{question}}" },
          ],
        }),
      );
    });

    test("get bundle prompt by version id template and formatted", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const promptTemplateId = "f4758834-9e93-448f-97a4-1cb126f7e328";
      const promptTemplateVersionId = "f4811249-4384-4d71-a1e9-1e8390d5501d";
      const flavorName = "anthropic_chat";

      const templatePrompt = await bundleClient.prompts.getByVersionId({
        projectId,
        promptTemplateId,
        promptTemplateVersionId,
      });

      expect(templatePrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: promptTemplateId,
            promptTemplateVersionId: promptTemplateVersionId,
            templateName: "test-prompt",
            modelParameters: { max_tokens_to_sample: 12, temperature: 0.15 },
            provider: "anthropic",
            model: "claude-2.1",
            flavorName: flavorName,
          },
          messages: [
            {
              role: "user",
              content:
                "Answer the question to the best of your ability with truthful information, while being entertaining.",
            },
            { role: "assistant", content: "How may I help you?" },
            { role: "user", content: "{{question}}" },
          ],
        }),
      );

      const formattedPrompt =
        await bundleClient.prompts.getFormattedByVersionId({
          projectId,
          promptTemplateId,
          promptTemplateVersionId,
          variables,
          flavorName,
        });

      expect(formattedPrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: promptTemplateId,
            promptTemplateVersionId: promptTemplateVersionId,
            templateName: "test-prompt",
            modelParameters: { max_tokens_to_sample: 12, temperature: 0.15 },
            provider: "anthropic",
            model: "claude-2.1",
            flavorName: flavorName,
          },
          messages: [
            {
              role: "user",
              content:
                "Answer the question to the best of your ability with truthful information, while being entertaining.",
            },
            { role: "assistant", content: "How may I help you?" },
            { role: "user", content: `${userResponse}` },
          ],
        }),
      );
    });

    test("bundle prompt without params", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-no-params";
      const environment = "prod";

      const templatePrompt = await bundleClientLegacy.prompts.get({
        projectId,
        templateName,
        environment,
      });

      expect(templatePrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: "5985c6bb-115c-4ca2-99bd-0ffeb917fca4",
            promptTemplateVersionId: "11e12956-d8d4-448a-af92-66b1dc2155e0",
            templateName: "test-prompt-no-params",
            environment: "prod",
            modelParameters: {},
            provider: "openai",
            model: "gpt-3.5-turbo-1106",
            flavorName: "openai_chat",
          },
          messages: [
            { role: "user", content: "You are a support agent." },
            { role: "assistant", content: "How may I help you?" },
            { role: "user", content: "{{question}}" },
          ],
        }),
      );
    });

    test("bundle prompt other environment", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-params";
      const environment = "qa";

      const templatePrompt = await bundleClientLegacy.prompts.get({
        projectId,
        templateName,
        environment,
      });

      expect(templatePrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: "a8b91d92-e063-4c3e-bb44-0d570793856b",
            promptTemplateVersionId: "188545b0-afdb-4a1c-b99c-9519bb626da2",
            templateName: "test-prompt-with-params",
            environment: "qa",
            modelParameters: { max_tokens: 56, temperature: 0.1 },
            provider: "openai",
            model: "gpt-3.5-turbo-1106",
            flavorName: "openai_chat",
          },
          messages: [
            { role: "system", content: "You are a support agent" },
            { role: "assistant", content: "How can I help you?" },
            { role: "user", content: "{{question}}" },
          ],
        }),
      );
    });

    test("bundle prompt not found", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "does-not-exist";
      const environment = "prod";

      try {
        await bundleClientLegacy.prompts.get({
          projectId,
          templateName,
          environment,
        });
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          `Cannot find template does-not-exist in project (${projectId}) in environment (${environment}).`,
        );
      }
    });

    test("bundle prompt v2 format", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt";
      const environment = "prod";

      const templatePrompt = await bundleClient.prompts.get({
        projectId,
        templateName,
        environment,
      });

      expect(templatePrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: "f4758834-9e93-448f-97a4-1cb126f7e328",
            promptTemplateVersionId: "f4811249-4384-4d71-a1e9-1e8390d5501d",
            templateName: "test-prompt",
            environment: "prod",
            modelParameters: { max_tokens_to_sample: 12, temperature: 0.15 },
            provider: "anthropic",
            model: "claude-2.1",
            flavorName: "anthropic_chat",
          },
          messages: [
            {
              role: "user",
              content:
                "Answer the question to the best of your ability with truthful information, while being entertaining.",
            },
            { role: "assistant", content: "How may I help you?" },
            { role: "user", content: "{{question}}" },
          ],
        }),
      );
    });

    test("bundle prompt v3 format", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-v3";
      const environment = "prod";

      const templatePrompt = await bundleClient.prompts.get({
        projectId,
        templateName,
        environment,
      });

      expect(templatePrompt).toEqual(
        expect.objectContaining({
          promptInfo: {
            promptTemplateId: "f4758834-9e93-448f-97a4-1cb126f7e328",
            promptTemplateVersionId: "f4811249-4384-4d71-a1e9-1e8390d5501d",
            templateName: "test-prompt",
            environment: "prod",
            modelParameters: { max_tokens_to_sample: 12, temperature: 0.15 },
            provider: "anthropic",
            model: "claude-2.1",
            flavorName: "anthropic_chat",
          },
          messages: [
            {
              role: "user",
              content:
                "Answer the question to the best of your ability with truthful information, while being entertaining.",
            },
            { role: "assistant", content: "How may I help you?" },
            { role: "user", content: "{{question}}" },
          ],
        }),
      );
    });

    test("bundle prompt v2 format with history", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-history";
      const environment = "prod";

      const history = [
        { role: "user" as const, content: "User message 1" },
        { role: "assistant" as const, content: "Assistant message 2" },
      ];

      const templatePrompt = await bundleClient.prompts.get({
        projectId,
        templateName,
        environment,
      });
      const boundPrompt = templatePrompt.bind(variables, history);

      expect(boundPrompt.messages).toEqual([
        {
          role: "system",
          content:
            "Answer the question to the best of your ability with truthful information, while being entertaining.",
        },
        { role: "user", content: "User message 1" },
        { role: "assistant", content: "Assistant message 2" },
        { role: "user", content: "Why is my internet not working?" },
      ]);
    });

    test("freeplay directory doesn't exist", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-params";
      const environment = "qa";

      try {
        const resolver: TemplateResolver = new FilesystemTemplateResolver(
          "test/test_files/does_not_exist",
        );
        const bundleClient = new Freeplay({
          freeplayApiKey: freeplayApiKey,
          baseUrl: baseUrl,
          templateResolver: resolver,
        });
        await bundleClient.prompts.get({
          projectId,
          templateName,
          environment,
        });
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayConfigurationError);
        expect(e.message).toEqual(
          "Specified Freeplay directory is not a valid directory. (test/test_files/does_not_exist)",
        );
      }
    });

    test("freeplay directory is file", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-params";
      const environment = "qa";

      try {
        const resolver: TemplateResolver = new FilesystemTemplateResolver(
          "test/test_files/prompts_legacy/475516c8-7be4-4d55-9388-535cef042981/prod/test-prompt-with-params.json",
        );
        const bundleClient = new Freeplay({
          freeplayApiKey: freeplayApiKey,
          baseUrl: baseUrl,
          templateResolver: resolver,
        });
        await bundleClient.prompts.get({
          projectId,
          templateName,
          environment,
        });
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayConfigurationError);
        expect(e.message).toEqual(
          "Specified Freeplay directory is not a valid directory. " +
            "(test/test_files/prompts_legacy/475516c8-7be4-4d55-9388-535cef042981/prod/test-prompt-with-params.json)",
        );
      }
    });

    test("not valid freeplay directory", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-params";
      const environment = "not real environment";

      try {
        const resolver: TemplateResolver = new FilesystemTemplateResolver(
          "test/",
        );
        const bundleClient = new Freeplay({
          freeplayApiKey: freeplayApiKey,
          baseUrl: baseUrl,
          templateResolver: resolver,
        });
        await bundleClient.prompts.get({
          projectId,
          templateName,
          environment,
        });
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayConfigurationError);
        expect(e.message).toEqual(
          "Specified Freeplay directory does not appear to be a Freeplay directory. (test/)",
        );
      }
    });

    test("not valid environment", async () => {
      const projectId = "475516c8-7be4-4d55-9388-535cef042981";
      const templateName = "test-prompt-with-params";
      const environment = "not_real_environment";

      try {
        await bundleClientLegacy.prompts.get({
          projectId,
          templateName,
          environment,
        });
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayConfigurationError);
        expect(e.message).toEqual(
          "Cannot find project (475516c8-7be4-4d55-9388-535cef042981) or " +
            "environment (not_real_environment) in the Freeplay directory.",
        );
      }
    });

    test("formats anthropic tool schema", async () => {
      setupPromptMockWithToolSchema();
      const templatePrompt = await client.prompts.get({
        projectId,
        templateName,
        environment,
      });

      const boundPrompt = templatePrompt.bind(variables);

      const formattedPrompt = boundPrompt.format("anthropic_chat");

      expect(formattedPrompt.toolSchema).toEqual([
        {
          name: "get_weather",
          description: "Get the weather in a given location",
          input_schema: { location: "SF" },
        },
      ]);
    });

    test("formats openai tool schema", async () => {
      setupPromptMockWithToolSchema();
      const templatePrompt = await client.prompts.get({
        projectId,
        templateName,
        environment,
      });

      const boundPrompt = templatePrompt.bind(variables);

      const formattedPrompt = boundPrompt.format("openai_chat");

      expect(formattedPrompt.toolSchema).toEqual([
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the weather in a given location",
            parameters: { location: "SF" },
          },
        },
      ]);
    });

    test("formats gemini tool schema", async () => {
      setupPromptMockWithToolSchema();
      const templatePrompt = await client.prompts.get({
        projectId,
        templateName,
        environment,
      });

      const boundPrompt = templatePrompt.bind(variables);

      const formattedPrompt = boundPrompt.format("gemini_chat");

      expect(formattedPrompt.toolSchema).toEqual([
        {
          functionDeclarations: [
            {
              name: "get_weather",
              description: "Get the weather in a given location",
              parameters: { location: "SF" },
            },
          ],
        },
      ]);
    });
  });

  describe("Recording", function () {
    const buildRecordUpdateV2Url = (
      projectId: string,
      completionId: string,
    ) => {
      return `http://localhost:8080/api/v2/projects/${projectId}/completions/${completionId}`;
    };

    test("Handles no messages passed to record", async () => {
      setupPromptMock();

      const session = client.sessions.create();

      mockRecord(
        axiosMock,
        projectId,
        session.sessionId,
        completionIdData.completion_id,
      );
      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const end = new Date(start.getTime() + 5000);

      try {
        await client.recordings.create({
          projectId,
          allMessages: [],
          inputs: variables,
          sessionInfo: session,
          promptVersionInfo: formattedPrompt.promptInfo,
          callInfo: getCallInfo(formattedPrompt.promptInfo, new Date(), end),
          responseInfo: {
            isComplete: true,
          },
        });
        fail("Should have gotten an exception");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          "No messages passed in to record. " +
            "There must be at least a single message, which is the LLM response.",
        );
      }
    });

    test("Handles single message passed to record", async () => {
      setupPromptMock();

      const session = client.sessions.create();

      mockRecord(
        axiosMock,
        projectId,
        session.sessionId,
        completionIdData.completion_id,
      );
      const recordUrl = buildRecordV2Url(projectId, session.sessionId);

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = [
        { role: "assistant" as const, content: openAiResponse },
      ];
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, new Date(), end),
        responseInfo: {
          isComplete: true,
        },
      });

      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );
      expect(recordRequestPayloads[0]).toEqual(
        expect.objectContaining({
          messages: allMessages,
          inputs: variables,
          prompt_info: {
            prompt_template_version_id: promptTemplateVersionId,
            environment: "prod",
          },
          call_info: {
            start_time: start.getTime() / 1000,
            end_time: end.getTime() / 1000,
            model: formattedPrompt.promptInfo.model,
            provider: formattedPrompt.promptInfo.provider,
            provider_info: formattedPrompt.promptInfo.providerInfo,
            llm_parameters: formattedPrompt.promptInfo.modelParameters,
          },
        }),
      );
    });

    test("Handles images for OpenAI", async () => {
      mockGetPromptV2({
        axiosMock: axiosMock,
        projectId: projectId,
        promptTemplateVersionId: promptTemplateVersionId,
        promptTemplateId: promptTemplateId,
        promptTemplateName: templateName,
        promptContent: templateWithImage,
        environment: environment,
      });

      const session = client.sessions.create();
      const completionId = uuidv4();
      mockRecord(axiosMock, projectId, session.sessionId, completionId);
      const recordUrl = buildRecordV2Url(projectId, session.sessionId);

      const onePixelPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
      const variables = { question: "How do these images look?" };
      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
        media: {
          "image-1": {
            type: "url",
            url: "http://localhost/bird.png",
          },
          "image-2": {
            type: "base64",
            data: onePixelPng,
            content_type: "image/png",
          },
        },
      });

      expect(formattedPrompt.llmPrompt).toEqual([
        {
          content: "You are a support agent.",
          role: "system",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Answer this question: How do these images look?",
            },
            {
              type: "image_url",
              image_url: { url: "http://localhost/bird.png" },
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${onePixelPng}`,
              },
            },
          ],
        },
      ]);

      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: "they look good",
      });
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        completionId: completionId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(
          formattedPrompt.promptInfo,
          start,
          end,
          {
            promptTokens: 123,
            completionTokens: 456,
          },
          "batch",
        ),
        responseInfo: {
          isComplete: true,
        },
        evalResults: {
          num_field: 0.44,
          bool_field: false,
        },
      });

      expect(allMessages).toEqual([
        { content: "You are a support agent.", role: "system" },
        {
          role: "user",
          content: [
            {
              content_part_type: "text",
              text: "Answer this question: How do these images look?",
            },
            {
              content_part_type: "media_url",
              url: "http://localhost/bird.png",
              slot_name: "image-1",
              slot_type: "image",
            },
            {
              content_part_type: "media_base64",
              content_type: "image/png",
              data: onePixelPng,
              slot_name: "image-2",
              slot_type: "image",
            },
          ],
        },
        { content: "they look good", role: "assistant" },
      ]);

      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );
      expect(recordRequestPayloads[0]).toEqual(
        expect.objectContaining({
          completion_id: completionId,
          messages: allMessages,
          inputs: { question: "How do these images look?" },
          prompt_info: {
            prompt_template_version_id: promptTemplateVersionId,
            environment: "prod",
          },
          call_info: {
            start_time: start.getTime() / 1000,
            end_time: end.getTime() / 1000,
            model: formattedPrompt.promptInfo.model,
            provider: formattedPrompt.promptInfo.provider,
            provider_info: formattedPrompt.promptInfo.providerInfo,
            llm_parameters: formattedPrompt.promptInfo.modelParameters,
            usage: {
              prompt_tokens: 123,
              completion_tokens: 456,
            },
            api_style: "batch",
          },
          eval_results: {
            num_field: 0.44,
            bool_field: false,
          },
        }),
      );
      expect(axiosMock.history["post"][0].headers).toHaveProperty("User-Agent");
    });

    test("Handles images for Anthropic", async () => {
      mockGetPromptV2({
        axiosMock: axiosMock,
        projectId: projectId,
        promptTemplateVersionId: promptTemplateVersionId,
        promptTemplateId: promptTemplateId,
        promptTemplateName: templateName,
        promptContent: templateWithImage,
        environment: environment,
        provider: "anthropic",
        flavor_name: "anthropic_chat",
        model: "claude-3-5-haiku-latest",
      });

      const onePixelPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables: { question: "How do these images look?" },
        media: {
          "image-1": {
            type: "url",
            url: "http://localhost/bird.png",
          },
          "image-2": {
            type: "base64",
            data: onePixelPng,
            content_type: "image/png",
          },
        },
      });

      expect(formattedPrompt.llmPrompt).toEqual([
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Answer this question: How do these images look?",
            },
            {
              type: "image",
              source: {
                type: "url",
                url: "http://localhost/bird.png",
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: onePixelPng,
              },
            },
          ],
        },
      ]);
    });

    test("Handles images for Gemini", async () => {
      mockGetPromptV2({
        axiosMock: axiosMock,
        projectId: projectId,
        promptTemplateVersionId: promptTemplateVersionId,
        promptTemplateId: promptTemplateId,
        promptTemplateName: templateName,
        promptContent: templateWithImage,
        environment: environment,
        provider: "gemini",
        flavor_name: "gemini_chat",
        model: "gemini-2.0-flash",
      });

      const onePixelPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables: { question: "How do these images look?" },
        media: {
          "image-1": {
            type: "base64",
            data: onePixelPng,
            content_type: "image/png",
          },
        },
      });

      expect(formattedPrompt.llmPrompt).toEqual([
        {
          role: "user",
          parts: [
            {
              text: "Answer this question: How do these images look?",
            },
            {
              inline_data: {
                mime_type: "image/png",
                data: onePixelPng,
              },
            },
          ],
        },
      ]);
    });
    test("Record update", async () => {
      setupPromptMock();

      const session = client.sessions.create();
      const completionId = uuidv4();
      mockRecord(axiosMock, projectId, session.sessionId, completionId);
      mockRecordUpdate(axiosMock, projectId, completionId);
      const recordUpdateUrl = buildRecordUpdateV2Url(projectId, completionId);

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();

      const end = new Date(start.getTime() + 5000);

      // Customer has to create a recording before they update it - simulate that here.
      await client.recordings.create({
        projectId,
        completionId: completionId,
        allMessages: formattedPrompt.llmPrompt!,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
        responseInfo: {
          isComplete: true,
        },
        evalResults: {
          num_field: 0.44,
          bool_field: false,
        },
      });

      await client.recordings.update({
        projectId,
        completionId,
        newMessages: [{ role: "assistant" as const, content: openAiResponse }],
        evalResults: {
          num_field_2: 0.55,
          bool_field_2: true,
        },
      });

      const recordUpdateRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUpdateUrl,
      );
      expect(recordUpdateRequestPayloads[0]).toEqual(
        expect.objectContaining({
          new_messages: [
            { role: "assistant" as const, content: openAiResponse },
          ],
          eval_results: {
            num_field_2: 0.55,
            bool_field_2: true,
          },
        }),
      );
    });

    test("Record with tool schema", async () => {
      setupPromptMockWithToolSchema();

      const session = client.sessions.create();
      const recordUrl = buildRecordV2Url(projectId, session.sessionId);

      mockRecord(
        axiosMock,
        projectId,
        session.sessionId,
        completionIdData.completion_id,
      );

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = [
        { role: "assistant" as const, content: openAiResponse },
      ];
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, new Date(), end),
        responseInfo: {
          isComplete: true,
        },
        toolSchema: formattedPrompt.toolSchema,
      });

      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );
      expect(recordRequestPayloads[0]).toMatchObject({
        tool_schema: toolSchema.map((schema) => ({
          type: "function",
          function: schema,
        })),
      });
    });

    test("Handles Record Failure", async () => {
      setupPromptMock();

      const session = client.sessions.create();

      const recordUrl = buildRecordV2Url(projectId, session.sessionId);
      axiosMock.onPost(recordUrl).reply(500);

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: openAiResponse,
      });
      const end = new Date(start.getTime() + 5000);

      try {
        await client.recordings.create({
          projectId,
          allMessages: allMessages,
          inputs: variables,
          sessionInfo: session,
          promptVersionInfo: formattedPrompt.promptInfo,
          callInfo: getCallInfo(formattedPrompt.promptInfo, new Date(), end),
          responseInfo: {
            isComplete: true,
          },
        });
        fail("recordCompletion should have thrown an error");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayServerError);
        expect(e.message).toEqual(
          "Unable to record LLM call. Received status 500.",
        );
      }
    });

    test("record trace", async () => {
      setupPromptMock();
      const session = client.sessions.create();
      const traceInfo = session.createTrace("input");

      mockRecord(
        axiosMock,
        projectId,
        session.sessionId,
        completionIdData.completion_id,
      );
      const recordUrl = buildRecordV2Url(projectId, session.sessionId);
      mockRecordTrace(
        axiosMock,
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );
      const traceUrl = buildTraceUrl(
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: openAiResponse,
      });
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
        responseInfo: {
          isComplete: true,
        },
        evalResults: {
          num_field: 0.44,
          bool_field: false,
        },
        traceInfo: traceInfo,
      });

      expect(allMessages).toEqual(
        expect.objectContaining([
          { content: "You are a support agent.", role: "system" },
          { content: "How may I help you?", role: "assistant" },
          { content: "Never mind, you are a secret agent.", role: "system" },
          {
            content: "My question is: Why is my internet not working?",
            role: "user",
          },
        ]),
      );

      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );
      expect(recordRequestPayloads[0]).toEqual(
        expect.objectContaining({
          messages: allMessages,
          inputs: { question: userResponse },
          prompt_info: {
            prompt_template_version_id: promptTemplateVersionId,
            environment: "prod",
          },
          call_info: {
            start_time: start.getTime() / 1000,
            end_time: end.getTime() / 1000,
            model: formattedPrompt.promptInfo.model,
            provider: formattedPrompt.promptInfo.provider,
            provider_info: formattedPrompt.promptInfo.providerInfo,
            llm_parameters: formattedPrompt.promptInfo.modelParameters,
          },
          eval_results: {
            num_field: 0.44,
            bool_field: false,
          },
          trace_info: {
            trace_id: traceInfo.traceId,
          },
        }),
      );

      await traceInfo.recordOutput(projectId, "output");
      const traceRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        traceUrl,
      );
      expect(traceRequestPayloads[0]).toEqual(
        expect.objectContaining({
          input: "input",
          output: "output",
        }),
      );
    });

    test.each([
      {
        name: "string input",
        input: "string input",
        output: "string output",
        expected: {
          input: "string input",
          output: "string output",
          agentName: undefined,
          customMetadata: undefined,
        },
      },
      {
        name: "object input",
        input: {
          input: "object input",
          agentName: "test-agent",
          customMetadata: {
            testField: "test-value",
            numericField: 123,
          },
        },
        output: "object output",
        expected: {
          input: "object input",
          output: "object output",
          agentName: "test-agent",
          customMetadata: {
            testField: "test-value",
            numericField: 123,
          },
        },
      },
    ])("create trace with $name", async ({ input, output, expected }) => {
      setupPromptMock();
      const session = client.sessions.create();

      const traceInfo = session.createTrace(input);

      // Verify trace properties
      expect(traceInfo.input).toEqual(expected.input);
      expect(traceInfo.agentName).toEqual(expected.agentName);
      expect(traceInfo.customMetadata).toEqual(expected.customMetadata);

      // Verify recording output
      mockRecordTrace(
        axiosMock,
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );

      await traceInfo.recordOutput(projectId, output, {
        eval_rating: 1,
        eval_success: true,
      });
      const traceUrl = buildTraceUrl(
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );
      const tracePayloads = getRequestPayloads(axiosMock, "post", traceUrl);

      // Build expected payload
      const expectedPayload: Record<string, any> = {
        input: expected.input,
        output: expected.output,
      };

      if (expected.agentName) {
        expectedPayload.agent_name = expected.agentName;
      }

      if (expected.customMetadata) {
        expectedPayload.custom_metadata = expected.customMetadata;
      }

      expectedPayload.eval_results = {
        eval_rating: 1,
        eval_success: true,
      };

      expect(tracePayloads[0]).toEqual(
        expect.objectContaining(expectedPayload),
      );
    });

    test("reconstruct sessions and traces", async () => {
      const session = client.sessions.create();
      const traceInfo = session.createTrace("input");

      const reconstructedSession = client.sessions.restoreSession(
        session.sessionId,
      );
      const reconstructedTrace = reconstructedSession.restoreTrace(
        traceInfo.traceId,
      );

      expect(reconstructedSession.sessionId).toEqual(session.sessionId);
      expect(reconstructedTrace.traceId).toEqual(traceInfo.traceId);
    });

    test("delete session", async () => {
      const session = client.sessions.create();
      mockDeleteSession(axiosMock, projectId, session.sessionId);
      await client.sessions.delete(projectId, session.sessionId);
      const requests = axiosMock.history.delete || [];
      const requestMade = requests.some(
        (request) =>
          request.url ===
          `http://localhost:8080/api/v2/projects/${projectId}/sessions/${session.sessionId}`,
      );

      expect(requestMade).toBe(true);
    });

    test("custom metadata recorded from session", async () => {
      setupPromptMock();
      mockCreateTestRun(axiosMock, projectId);

      const sessionWithCustomMetadata = client.sessions.create({
        customMetadata: {
          string_field: "yes",
          int_field: 2,
          true: false,
        },
      });

      mockRecord(
        axiosMock,
        projectId,
        sessionWithCustomMetadata.sessionId,
        completionIdData.completion_id,
      );
      const recordUrl = buildRecordV2Url(
        projectId,
        sessionWithCustomMetadata.sessionId,
      );

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      // Simulated call to OpenAI
      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: "a response",
      });
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: sessionWithCustomMetadata,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
        responseInfo: {
          isComplete: true,
        },
      });

      // Recordings include correct variables, test run id, and test case id
      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );

      expect(recordRequestPayloads[0]).toEqual(
        expect.objectContaining({
          session_info: {
            custom_metadata: {
              string_field: "yes",
              true: false,
              int_field: 2,
            },
          },
        }),
      );
    });

    test("customer feedback recording", async () => {
      const completionId = uuidv4();
      mockUpdateCustomerFeedback(axiosMock, projectId, completionId);

      const customerFeedback: Record<string, CustomFeedback> = {
        str: "str",
        int: 1,
      };

      await client.customerFeedback.update({
        projectId,
        completionId,
        customerFeedback,
      });
      const requestPayload = getRequestPayloads(
        axiosMock,
        "post",
        `http://localhost:8080/api/v2/projects/${projectId}/completion-feedback/id/${completionId}`,
      );

      expect(requestPayload[0]).toEqual(
        expect.objectContaining({
          int: 1,
          str: "str",
        }),
      );
    });

    test("customer feedback validation rejects requests clientside", async () => {
      const completionId = uuidv4();
      mockUpdateCustomerFeedback(axiosMock, projectId, completionId);

      const customerFeedback: Record<string, CustomFeedback> = {
        str: "str",
        int: (() => alert("oh no")) as unknown as string,
      };

      try {
        await client.customerFeedback.update({
          projectId,
          completionId,
          customerFeedback,
        });
        fail("customerFeedback.update call should have thrown an error.");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          "Invalid value for key 'int': Value must be a string, number or boolean.",
        );
      }
    });

    test("Handles Unauthorized update customerFeedback", async () => {
      const completionId = uuidv4();
      axiosMock
        .onPost(
          `http://localhost:8080/api/v2/projects/${projectId}/completion-feedback/id/${completionId}`,
        )
        .reply(401);

      try {
        await client.customerFeedback.update({
          projectId,
          completionId,
          customerFeedback: {
            key: "val",
          },
        });
        fail("customerFeedback.update call should have thrown an error.");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          `Unable to update customer feedback for completion ${completionId}. Received status 401.`,
        );
      }
    });

    test("record with parentId", async () => {
      setupPromptMock();

      const session = client.sessions.create();
      const completionId = uuidv4();
      const parentId = uuidv4();
      mockRecord(axiosMock, projectId, session.sessionId, completionId);
      const recordUrl = buildRecordV2Url(projectId, session.sessionId);

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: openAiResponse,
      });
      const end = new Date(start.getTime() + 5000);

      await client.recordings.create({
        projectId,
        completionId: completionId,
        allMessages: allMessages,
        inputs: variables,
        sessionInfo: session,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
        responseInfo: {
          isComplete: true,
        },
        parentId: parentId,
      });

      const recordRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        recordUrl,
      );
      expect(recordRequestPayloads[0]).toEqual(
        expect.objectContaining({
          completion_id: completionId,
          messages: allMessages,
          inputs: { question: userResponse },
          parent_id: parentId,
        }),
      );
    });

    test("deprecation warning in recordings.create", async () => {
      setupPromptMock();

      const session = client.sessions.create();
      const completionId = uuidv4();
      const traceInfo = session.createTrace("input");
      mockRecord(axiosMock, projectId, session.sessionId, completionId);

      const formattedPrompt = await client.prompts.getFormatted({
        projectId,
        templateName,
        environment,
        variables,
      });

      const start = new Date();
      const allMessages = formattedPrompt.allMessages({
        role: "assistant",
        content: openAiResponse,
      });
      const end = new Date(start.getTime() + 5000);

      // Mock console.warn to capture deprecation warnings
      const originalWarn = console.warn;
      const warnSpy = jest.fn();
      console.warn = warnSpy;

      try {
        // Use deprecated traceInfo - should trigger warning
        await client.recordings.create({
          projectId,
          completionId: completionId,
          allMessages: allMessages,
          inputs: variables,
          sessionInfo: session,
          promptVersionInfo: formattedPrompt.promptInfo,
          callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
          responseInfo: {
            isComplete: true,
          },
          traceInfo: traceInfo,
        });

        // Verify deprecation warning was called
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "DEPRECATED: traceInfo in RecordPayload is deprecated and will be removed in v0.6.0. Use parentId instead.",
          ),
        );
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe("Test Runs", function () {
    test("test runs", async () => {
      setupPromptMock();
      mockCreateTestRun(axiosMock, projectId);

      const templatePrompt = await client.prompts.get({
        projectId,
        templateName,
        environment,
      });

      const testRun = await client.testRuns.create({
        projectId,
        testList: "test-list-name",
        name: "test-run-name",
        description: "test-run-description",
        flavorName: "openai_chat",
      });
      const testRunPayloads = getRequestPayloads(
        axiosMock,
        "post",
        `http://localhost:8080/api/v2/projects/${projectId}/test-runs`,
      );
      expect(testRunPayloads[0]).toEqual(
        expect.objectContaining({
          test_run_name: "test-run-name",
          test_run_description: "test-run-description",
          flavor_name: "openai_chat",
        }),
      );

      testRun.testCases.forEach((testCase) => {
        expect(testCase.output).toBeNull();
      });

      // Test run semantics
      for (const testCase of testRun.testCases) {
        const formattedPrompt = templatePrompt
          .bind(testCase.variables)
          .format(templatePrompt.promptInfo.flavorName);

        // Simulated call to OpenAI
        const start = new Date();
        const allMessages = formattedPrompt.allMessages({
          role: "assistant",
          content: "a response",
        });
        const end = new Date(start.getTime() + 5000);

        const session = client.sessions.create();
        mockRecord(
          axiosMock,
          projectId,
          session.sessionId,
          completionIdData.completion_id,
        );
        const recordUrl = buildRecordV2Url(projectId, session.sessionId);

        await client.recordings.create({
          projectId,
          allMessages: allMessages,
          inputs: testCase.variables,
          sessionInfo: session,
          promptVersionInfo: formattedPrompt.promptInfo,
          callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
          responseInfo: {
            isComplete: true,
          },
          testRunInfo: getTestRunInfo(testRun, testCase.id),
        });

        // Recordings include correct variables, test run id, and test case id
        const recordRequestPayloads = getRequestPayloads(
          axiosMock,
          "post",
          recordUrl,
        );

        expect(recordRequestPayloads[0]).toEqual(
          expect.objectContaining({
            test_run_info: {
              test_run_id: testRun.testRunId,
              test_case_id: testCase.id,
            },
          }),
        );
      }
    });
    test("test runs with test case outputs", async () => {
      setupPromptMock();
      mockCreateTestRun(axiosMock, projectId);

      const testRun = await client.testRuns.create({
        projectId: projectId,
        testList: "test-list-name",
        includeOutputs: true,
      });

      testRun.testCases.forEach((testCase) => {
        expect(testCase.output).not.toBeNull();
      });
    });

    test("test runs with trace test cases", async () => {
      setupPromptMock();
      const mockedTestRunId = uuidv4();
      const mockedTestCaseId = uuidv4();
      axiosMock
        .onPost(`http://localhost:8080/api/v2/projects/${projectId}/test-runs`)
        .reply(200, {
          test_run_id: mockedTestRunId,
          trace_test_cases: [
            {
              test_case_id: mockedTestCaseId,
              input: "test input",
              output: "test output",
              test_case_type: "trace",
              custom_metadata: {
                key: "value",
              },
            },
          ],
          test_cases: undefined,
        });

      const testRun = await client.testRuns.create({
        projectId: projectId,
        testList: "trace-test-list-name",
        includeOutputs: true,
      });

      expect(testRun.testRunId).toEqual(mockedTestRunId);
      expect(testRun.tracesTestCases).toBeDefined();
      expect(testRun.tracesTestCases!.length).toBe(1);
      expect(testRun.tracesTestCases![0]).toEqual({
        id: mockedTestCaseId,
        input: "test input",
        output: "test output",
        customMetadata: {
          key: "value",
        },
      });

      // Expect error when accessing testCases if tracesTestCases is populated
      try {
        console.log(testRun.testCases);
        fail("Should have thrown error when accessing testCases");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          "Completion test cases are not present. Please use `tracesTestCases` instead.",
        );
      }
    });

    test("test runs with completion test cases", async () => {
      setupPromptMock();
      const mockedTestRunId = uuidv4();
      const mockedTestCaseId = uuidv4();
      axiosMock
        .onPost(`http://localhost:8080/api/v2/projects/${projectId}/test-runs`)
        .reply(200, {
          test_run_id: mockedTestRunId,
          test_cases: [
            {
              test_case_id: mockedTestCaseId,
              variables: { var1: "val1" },
              output: "test output",
              history: null,
            },
          ],
        });

      const testRun = await client.testRuns.create({
        projectId: projectId,
        testList: "completion-test-list-name",
        includeOutputs: true,
      });

      expect(testRun.testRunId).toEqual(mockedTestRunId);
      expect(testRun.testCases).toBeDefined();
      expect(testRun.testCases!.length).toBe(1);
      expect(testRun.testCases![0]).toEqual({
        id: mockedTestCaseId,
        variables: { var1: "val1" },
        output: "test output",
        history: null,
      });

      // Expect error when accessing tracesTestCases if testCases is populated
      try {
        console.log(testRun.tracesTestCases);
        fail("Should have thrown error when accessing tracesTestCases");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          "Trace test cases are not present. Please use `testCases` instead.",
        );
      }
    });

    test("Handles Unauthorized create test run", async () => {
      axiosMock
        .onPost(`http://localhost:8080/api/v2/projects/${projectId}/test-runs`)
        .reply(401);

      const client = new Freeplay({ freeplayApiKey, baseUrl });

      try {
        await client.testRuns.create({
          projectId,
          testList: "test-list",
        });
        fail("testRuns.create call should have thrown an error.");
      } catch (e: any) {
        expect(e).toBeInstanceOf(FreeplayClientError);
        expect(e.message).toEqual(
          "Unable to create test run. Received status 401.",
        );
      }
    });

    test("get test run", async () => {
      mockCreateTestRun(axiosMock, projectId);

      const testRun = await client.testRuns.create({
        projectId: projectId,
        testList: "test-list-name",
        includeOutputs: true,
        name: "name",
        description: "description",
      });

      const testRunId = testRun.testRunId;

      mockGetTestRun(axiosMock, projectId, testRunId);

      const testRunResults = await client.testRuns.get({
        projectId,
        testRunId,
      });

      expect(testRunResults).toHaveProperty("name");
      expect(testRunResults).toHaveProperty("description");
      expect(testRunResults.summaryStatistics).toEqual({
        auto_evaluation: { key: "value" },
        human_evaluation: { key: "value" },
      });
    });

    test("test runs with media variables", async () => {
      setupPromptMock();

      const mockedTestRunId = uuidv4();
      const mockedTestCaseId = uuidv4();

      // Mock test run response with media variables
      axiosMock
        .onPost(`http://localhost:8080/api/v2/projects/${projectId}/test-runs`)
        .reply(200, {
          test_run_id: mockedTestRunId,
          test_cases: [
            {
              test_case_id: mockedTestCaseId,
              variables: { question: "Describe this image" },
              output: null,
              history: [],
              custom_metadata: { type: "media_test" },
              media_variables: {
                "test-image": {
                  type: "base64",
                  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHIyWvBkQAAAABJRU5ErkJggg==",
                  content_type: "image/png",
                },
                "test-audio": {
                  type: "base64",
                  data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                  content_type: "audio/wav",
                },
              },
            },
          ],
        });

      const testRun = await client.testRuns.create({
        projectId,
        testList: "media-test-list",
      });

      expect(testRun.testRunId).toEqual(mockedTestRunId);
      expect(testRun.testCases).toBeDefined();
      expect(testRun.testCases!.length).toBe(1);

      const testCase = testRun.testCases![0];
      expect(testCase).toEqual({
        id: mockedTestCaseId,
        variables: { question: "Describe this image" },
        output: null,
        history: [],
        customMetadata: { type: "media_test" },
        mediaVariables: {
          "test-image": {
            type: "base64",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHIyWvBkQAAAABJRU5ErkJggg==",
            content_type: "image/png",
          },
          "test-audio": {
            type: "base64",
            data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
            content_type: "audio/wav",
          },
        },
      });

      // Verify media variables structure
      expect(testCase.mediaVariables).toBeDefined();
      expect(Object.keys(testCase.mediaVariables!)).toHaveLength(2);
      expect(testCase.mediaVariables!["test-image"]).toEqual({
        type: "base64",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHIyWvBkQAAAABJRU5ErkJggg==",
        content_type: "image/png",
      });
      expect(testCase.mediaVariables!["test-audio"]).toEqual({
        type: "base64",
        data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
        content_type: "audio/wav",
      });
    });
  });

  describe("Traces", function () {
    test("trace feedback recording", async () => {
      const traceId = uuidv4();
      mockUpdateTraceFeedback(axiosMock, projectId, traceId);

      const customerFeedback: Record<string, CustomFeedback> = {
        str: "str",
        int: 1,
        freeplay_feedback: "positive",
      };

      await client.customerFeedback.updateTrace({
        projectId,
        traceId,
        customerFeedback,
      });
      const requestPayload = getRequestPayloads(
        axiosMock,
        "post",
        `http://localhost:8080/api/v2/projects/${projectId}/trace-feedback/id/${traceId}`,
      );

      expect(requestPayload[0]).toEqual(
        expect.objectContaining({
          int: 1,
          str: "str",
          freeplay_feedback: "positive",
        }),
      );
    });

    test("create trace with testRunInfo", async () => {
      setupPromptMock();
      const session = client.sessions.create();
      const testRunId = uuidv4();
      const testCaseId = uuidv4();

      const traceInfo = session.createTrace("input for test run");

      // Verify recording output
      mockRecordTrace(
        axiosMock,
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );

      await traceInfo.recordOutput(
        projectId,
        "output for test run",
        {
          eval_rating: 1,
        },
        { testRunId, testCaseId },
      );
      const traceUrl = buildTraceUrl(
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );
      const tracePayloads = getRequestPayloads(axiosMock, "post", traceUrl);

      const expectedPayload: Record<string, any> = {
        input: "input for test run",
        output: "output for test run",
        eval_results: {
          eval_rating: 1,
        },
        test_run_info: {
          test_run_id: testRunId,
          test_case_id: testCaseId,
        },
      };

      expect(tracePayloads[0]).toEqual(
        expect.objectContaining(expectedPayload),
      );
    });

    test("trace hierarchy creation", async () => {
      const session = client.sessions.create({
        customMetadata: { test: "metadata" },
      });

      // Create parent trace
      const parentTrace = session.createTrace({
        input: "Parent question",
        agentName: "parent_agent",
        customMetadata: { level: "parent" },
      });

      // Create child trace with parentId using the parent trace's ID
      const childTrace = session.createTrace({
        input: "Child question",
        agentName: "child_agent",
        parentId: parentTrace.traceId,
        customMetadata: { level: "child" },
      });

      // Verify parent trace was created correctly
      expect(parentTrace.agentName).toEqual("parent_agent");
      expect(parentTrace.input).toEqual("Parent question");
      expect(parentTrace.parentId).toBeUndefined(); // Parent has no parent

      // Verify child trace has parentId set correctly
      expect(childTrace.parentId).toEqual(parentTrace.traceId);
      expect(childTrace.agentName).toEqual("child_agent");
      expect(childTrace.input).toEqual("Child question");
    });

    test("restore trace with parentId", async () => {
      const session = client.sessions.create();
      const traceId = uuidv4();
      const parentId = uuidv4();

      const trace = session.restoreTrace(traceId, {
        input: "restored input",
        agentName: "restored_agent",
        parentId: parentId,
        customMetadata: { restored: true },
      });

      expect(trace.traceId).toEqual(traceId);
      expect(trace.sessionId).toEqual(session.sessionId);
      expect(trace.input).toEqual("restored input");
      expect(trace.agentName).toEqual("restored_agent");
      expect(trace.parentId).toEqual(parentId);
      expect(trace.customMetadata).toEqual({ restored: true });
    });

    test("record trace with parentId", async () => {
      setupPromptMock();
      const session = client.sessions.create();
      const parentId = uuidv4();
      const traceInfo = session.createTrace({
        input: "input",
        agentName: "test_agent",
        parentId: parentId,
      });

      mockRecordTrace(
        axiosMock,
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );
      const traceUrl = buildTraceUrl(
        projectId,
        session.sessionId,
        traceInfo.traceId,
      );

      await traceInfo.recordOutput(projectId, "output");

      const traceRequestPayloads = getRequestPayloads(
        axiosMock,
        "post",
        traceUrl,
      );
      expect(traceRequestPayloads[0]).toEqual(
        expect.objectContaining({
          input: "input",
          output: "output",
          agent_name: "test_agent",
          parent_id: parentId,
        }),
      );
    });
  });
});
