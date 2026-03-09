import { v4 as uuidv4 } from "uuid";
import Freeplay, {
  FreeplayConfigurationError,
  ProviderMessage,
  TemplateMessage,
} from "../src";
import {
  prepareMessages,
  OpenAILLMAdapter,
  OpenAIResponsesAdapter,
  AnthropicLLMAdapter,
} from "../src/model";
import { getAxiosMock, mockGetPromptV2 } from "./test_support";

const freeplayApiKey = "test-api-key";
const environment = "prod";
const projectId: string = uuidv4();
const promptTemplateVersionId: string = uuidv4();
const promptTemplateId: string = uuidv4();
const templateName = "my-template";
const axiosMock = getAxiosMock();

const client = new Freeplay({
  freeplayApiKey,
  baseUrl: "http://localhost:8080/api",
});

const variables = { question: "Why is my internet not working?" };

const setupMock = (
  template: TemplateMessage[],
  flavor: string = "openai_responses",
) => {
  mockGetPromptV2({
    axiosMock,
    projectId,
    promptTemplateVersionId,
    promptTemplateId,
    promptTemplateName: templateName,
    promptContent: template,
    environment,
    flavor_name: flavor,
  });
};

afterEach(() => {
  axiosMock.reset();
});

describe("OpenAIResponsesAdapter", () => {
  const adapter = new OpenAIResponsesAdapter();

  test("strips system messages and wraps in Responses API format", () => {
    const messages: ProviderMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];

    const result = adapter.toLLMSyntax(messages);

    expect(result).toEqual([
      { type: "message", role: "user", content: "Hello" },
      { type: "message", role: "assistant", content: "Hi there" },
    ]);
  });

  test("passes through developer role", () => {
    const messages: ProviderMessage[] = [
      { role: "developer", content: "Be concise." },
      { role: "user", content: "Hello" },
    ];

    const result = adapter.toLLMSyntax(messages);

    expect(result).toEqual([
      { type: "message", role: "developer", content: "Be concise." },
      { type: "message", role: "user", content: "Hello" },
    ]);
  });

  test("wraps all messages with type: message", () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: "Hello" },
      {
        type: "function_call",
        role: "assistant",
        name: "get_weather",
        arguments: '{"location":"SF"}',
        call_id: "call_123",
      },
    ];

    const result = adapter.toLLMSyntax(messages);

    expect(result).toEqual([
      { type: "message", role: "user", content: "Hello" },
      {
        type: "function_call",
        role: "assistant",
        name: "get_weather",
        arguments: '{"location":"SF"}',
        call_id: "call_123",
      },
    ]);
  });

  test("handles tool role messages", () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: "What's the weather?" },
      { role: "tool", content: '{"temp": 72}', tool_call_id: "call_123" },
    ];

    const result = adapter.toLLMSyntax(messages);

    expect(result).toEqual([
      { type: "message", role: "user", content: "What's the weather?" },
      {
        type: "message",
        role: "tool",
        content: '{"temp": 72}',
        tool_call_id: "call_123",
      },
    ]);
  });

  test("provider returns openai", () => {
    expect(adapter.provider()).toBe("openai");
  });
});

describe("prepareMessages - role coercion", () => {
  test("developer passes through for openai_responses", () => {
    const adapter = new OpenAIResponsesAdapter();
    const messages: ProviderMessage[] = [
      { role: "developer", content: "Be concise." },
      { role: "user", content: "Hello" },
    ];

    const result = prepareMessages(messages, adapter.roleSupport);

    expect(result).toEqual(messages);
  });

  test("developer coerced to system for openai_chat", () => {
    const adapter = new OpenAILLMAdapter();
    const messages: ProviderMessage[] = [
      { role: "developer", content: "Be concise." },
      { role: "user", content: "Hello" },
    ];

    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    const result = prepareMessages(messages, adapter.roleSupport);
    warnSpy.mockRestore();

    expect(result).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hello" },
    ]);
  });

  test("developer throws for anthropic_chat", () => {
    const adapter = new AnthropicLLMAdapter();
    const messages: ProviderMessage[] = [
      { role: "developer", content: "Be concise." },
    ];

    expect(() => prepareMessages(messages, adapter.roleSupport)).toThrow(
      FreeplayConfigurationError,
    );
  });

  test("tool role passes through for openai_chat", () => {
    const adapter = new OpenAILLMAdapter();
    const messages: ProviderMessage[] = [
      { role: "user", content: "Hello" },
      { role: "tool", content: '{"result": 42}', tool_call_id: "call_1" },
    ];

    const result = prepareMessages(messages, adapter.roleSupport);

    expect(result).toEqual(messages);
  });

  test("tool role passes through for openai_responses", () => {
    const adapter = new OpenAIResponsesAdapter();
    const messages: ProviderMessage[] = [
      { role: "user", content: "Hello" },
      { role: "tool", content: '{"result": 42}', tool_call_id: "call_1" },
    ];

    const result = prepareMessages(messages, adapter.roleSupport);

    expect(result).toEqual(messages);
  });

  test("tool role throws for anthropic_chat", () => {
    const adapter = new AnthropicLLMAdapter();
    const messages: ProviderMessage[] = [
      { role: "tool", content: '{"result": 42}' },
    ];

    expect(() => prepareMessages(messages, adapter.roleSupport)).toThrow(
      FreeplayConfigurationError,
    );
  });
});

describe("OpenAI Responses - end to end formatting", () => {
  test("formats prompt with system extracted and messages wrapped", async () => {
    const template: TemplateMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Question: {{question}}" },
    ];

    setupMock(template);

    const formatted = await client.prompts.getFormatted({
      projectId,
      templateName,
      environment,
      variables,
    });

    expect(formatted.systemContent).toBe("You are helpful.");
    expect(formatted.llmPrompt).toEqual([
      {
        type: "message",
        role: "user",
        content: "Question: Why is my internet not working?",
      },
    ]);
    expect(formatted.promptInfo.flavorName).toBe("openai_responses");
  });

  test("formats prompt with developer role", async () => {
    const template: TemplateMessage[] = [
      { role: "developer", content: "Be concise." },
      { role: "user", content: "{{question}}" },
    ];

    setupMock(template);

    const formatted = await client.prompts.getFormatted({
      projectId,
      templateName,
      environment,
      variables,
    });

    expect(formatted.llmPrompt).toEqual([
      { type: "message", role: "developer", content: "Be concise." },
      {
        type: "message",
        role: "user",
        content: "Why is my internet not working?",
      },
    ]);
  });

  test("allMessages returns raw messages with new message appended", async () => {
    const template: TemplateMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "{{question}}" },
    ];

    setupMock(template);

    const formatted = await client.prompts.getFormatted({
      projectId,
      templateName,
      environment,
      variables,
    });

    const all = formatted.allMessages({
      role: "assistant",
      content: "Let me help.",
    });

    // allMessages returns raw (pre-adapter) messages, not LLM-formatted
    expect(all).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Why is my internet not working?" },
      { role: "assistant", content: "Let me help." },
    ]);
  });

  test("allMessages accepts array of messages (Responses API output)", async () => {
    const template: TemplateMessage[] = [
      { role: "user", content: "{{question}}" },
    ];

    setupMock(template);

    const formatted = await client.prompts.getFormatted({
      projectId,
      templateName,
      environment,
      variables,
    });

    const all = formatted.allMessages([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Let me help." }],
      },
    ] as any);

    expect(all).toHaveLength(2);
    expect(all[1]).toEqual({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Let me help." }],
    });
  });

  test("output schema supported for openai_responses", async () => {
    const template: TemplateMessage[] = [
      { role: "user", content: "{{question}}" },
    ];

    setupMock(template);

    const templatePrompt = await client.prompts.get({
      projectId,
      templateName,
      environment,
    });

    // Manually set output schema to test formatting
    templatePrompt.outputSchema = {
      type: "json_schema",
      json_schema: { name: "Output", strict: true, schema: {} },
    };

    const boundPrompt = templatePrompt.bind(variables);
    const formatted = boundPrompt.format("openai_responses");

    expect(formatted.outputSchema).toEqual({
      type: "json_schema",
      json_schema: { name: "Output", strict: true, schema: {} },
    });
  });

  test("effective flavor and provider reflected in promptInfo when overridden", async () => {
    const template: TemplateMessage[] = [
      { role: "user", content: "{{question}}" },
    ];

    // Set up with anthropic_chat as the original flavor
    mockGetPromptV2({
      axiosMock,
      projectId,
      promptTemplateVersionId,
      promptTemplateId,
      promptTemplateName: templateName,
      promptContent: template,
      environment,
      flavor_name: "anthropic_chat",
      provider: "anthropic",
    });

    const templatePrompt = await client.prompts.get({
      projectId,
      templateName,
      environment,
    });

    const boundPrompt = templatePrompt.bind(variables);
    const formatted = boundPrompt.format("openai_responses");

    expect(formatted.promptInfo.flavorName).toBe("openai_responses");
    expect(formatted.promptInfo.provider).toBe("openai");
  });
});
