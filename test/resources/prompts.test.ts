import {
  BoundPrompt,
  extractMediaContent,
  mapParametersForGemini,
  MediaInputMap,
  MediaSlot,
  PromptInfo,
  ProviderMessage,
  TemplateMessage,
  TemplatePrompt,
} from "../../src";

describe("prompts", () => {
  test("extractMediaContent", () => {
    const media: MediaInputMap = {
      "image-one": {
        type: "url",
        url: "https://localhost/image",
      },
      "image-two": {
        type: "base64",
        content_type: "image/jpeg",
        data: "some-base64-data",
      },
    };
    const slots: MediaSlot[] = [
      { type: "image", placeholder_name: "image-one" },
      { type: "image", placeholder_name: "image-two" },
    ];

    const content = extractMediaContent(media, slots);

    expect(content).toEqual([
      {
        content_part_type: "media_url",
        url: "https://localhost/image",
        slot_name: "image-one",
        slot_type: "image",
      },
      {
        content_part_type: "media_base64",
        content_type: "image/jpeg",
        data: "some-base64-data",
        slot_name: "image-two",
        slot_type: "image",
      },
    ]);
  });

  test("output schema with OpenAI", () => {
    const outputSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
      required: ["name"],
    };

    const promptInfo: PromptInfo = {
      promptTemplateId: "test-id",
      promptTemplateVersionId: "test-version-id",
      templateName: "test-template",
      modelParameters: {},
      provider: "openai",
      model: "gpt-4",
      flavorName: "openai_chat",
    };

    const messages: TemplateMessage[] = [
      { role: "system", content: "System message" },
      { role: "user", content: "User message {{number}}" },
    ];

    const templatePrompt = new TemplatePrompt(
      promptInfo,
      messages,
      undefined,
      outputSchema,
    );

    const boundPrompt = templatePrompt.bind({ number: 1 });
    const formattedPrompt = boundPrompt.format();

    expect(formattedPrompt.outputSchema).toEqual(outputSchema);
  });

  test("output schema is passed through from template to formatted prompt", () => {
    const outputSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        rating: { type: "number" },
      },
    };

    const promptInfo: PromptInfo = {
      promptTemplateId: "test-id",
      promptTemplateVersionId: "test-version-id",
      templateName: "test-template",
      modelParameters: {},
      provider: "openai",
      model: "gpt-4",
      flavorName: "openai_chat",
    };

    const messages: TemplateMessage[] = [
      { role: "system", content: "System message" },
      { role: "user", content: "User message {{number}}" },
    ];

    const templatePrompt = new TemplatePrompt(
      promptInfo,
      messages,
      undefined,
      outputSchema,
    );

    expect(templatePrompt.outputSchema).toEqual(outputSchema);

    const boundPrompt = templatePrompt.bind({ number: 1 });
    expect(boundPrompt.outputSchema).toEqual(outputSchema);

    const formattedPrompt = boundPrompt.format();
    expect(formattedPrompt.outputSchema).toEqual(outputSchema);
  });

  describe("history binding", () => {
    const promptInfo: PromptInfo = {
      promptTemplateId: "test-id",
      promptTemplateVersionId: "test-version-id",
      templateName: "test-template",
      modelParameters: {},
      provider: "openai",
      model: "gpt-4",
      flavorName: "openai_chat",
    };

    test("history without placeholder appends after template messages", () => {
      const messages: TemplateMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Question: {{q}}" },
      ];
      const history: ProviderMessage[] = [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ];

      const templatePrompt = new TemplatePrompt(promptInfo, messages);
      const bound = templatePrompt.bind({ q: "Hello" }, history);

      expect(bound.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Question: Hello" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ]);
    });

    test("history with placeholder inserts at placeholder position", () => {
      const messages: TemplateMessage[] = [
        { role: "system", content: "You are helpful." },
        { kind: "history" },
        { role: "user", content: "Question: {{q}}" },
      ];
      const history: ProviderMessage[] = [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ];

      const templatePrompt = new TemplatePrompt(promptInfo, messages);
      const bound = templatePrompt.bind({ q: "Hello" }, history);

      expect(bound.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
        { role: "user", content: "Question: Hello" },
      ]);
    });

    test("no history, no placeholder produces only template messages", () => {
      const messages: TemplateMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Question: {{q}}" },
      ];

      const templatePrompt = new TemplatePrompt(promptInfo, messages);
      const bound = templatePrompt.bind({ q: "Hello" });

      expect(bound.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Question: Hello" },
      ]);
    });

    test("no history with placeholder logs warning", () => {
      const messages: TemplateMessage[] = [
        { role: "system", content: "You are helpful." },
        { kind: "history" },
        { role: "user", content: "Question: {{q}}" },
      ];

      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const templatePrompt = new TemplatePrompt(promptInfo, messages);
      templatePrompt.bind({ q: "Hello" });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("expects history but none was provided"),
      );
      warnSpy.mockRestore();
    });

    test("history without placeholder filters out system messages", () => {
      const messages: TemplateMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Question: {{q}}" },
      ];
      const history: ProviderMessage[] = [
        { role: "system", content: "Should be filtered" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ];

      const templatePrompt = new TemplatePrompt(promptInfo, messages);
      const bound = templatePrompt.bind({ q: "Hello" }, history);

      expect(bound.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Question: Hello" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ]);
    });
  });

  describe("mapParametersForGemini", () => {
    test("renames max_tokens to max_output_tokens", () => {
      const result = mapParametersForGemini({ max_tokens: 1024 });
      expect(result).toEqual({ max_output_tokens: 1024 });
    });

    test("converts string thinking_level to thinking_config", () => {
      const result = mapParametersForGemini({ thinking_level: "Medium" });
      expect(result).toEqual({
        thinking_config: { thinking_level: "medium" },
      });
    });

    test("converts numeric thinking_level to thinking_config with budget", () => {
      const result = mapParametersForGemini({ thinking_level: 4096 });
      expect(result).toEqual({
        thinking_config: { thinking_budget: 4096 },
      });
    });

    test("truncates float thinking_level to integer budget", () => {
      const result = mapParametersForGemini({ thinking_level: 2048.7 });
      expect(result).toEqual({
        thinking_config: { thinking_budget: 2048 },
      });
    });

    test("passes through temperature and other keys unchanged", () => {
      const result = mapParametersForGemini({
        temperature: 0.7,
        top_p: 0.9,
      });
      expect(result).toEqual({ temperature: 0.7, top_p: 0.9 });
    });

    test("handles all transformations together", () => {
      const result = mapParametersForGemini({
        max_tokens: 512,
        thinking_level: "high",
        temperature: 0.5,
      });
      expect(result).toEqual({
        max_output_tokens: 512,
        thinking_config: { thinking_level: "high" },
        temperature: 0.5,
      });
    });

    test("deep-clones nested values", () => {
      const nested = { custom: { nested: [1, 2, 3] } };
      const result = mapParametersForGemini(nested);
      expect(result).toEqual(nested);
      expect(result["custom"]).not.toBe(nested["custom"]);
    });

    test("returns empty object for empty input", () => {
      expect(mapParametersForGemini({})).toEqual({});
    });
  });

  describe("BoundPrompt.format() applies Gemini parameter mapping", () => {
    const geminiPromptInfo = (
      flavor: string,
    ): PromptInfo => ({
      promptTemplateId: "test-id",
      promptTemplateVersionId: "test-version-id",
      templateName: "test-template",
      modelParameters: { max_tokens: 1024, temperature: 0.5 },
      provider: "vertex",
      model: "gemini-2.0-flash",
      flavorName: flavor,
    });

    test("maps parameters for gemini_chat flavor", () => {
      const bound = new BoundPrompt(
        geminiPromptInfo("gemini_chat"),
        [{ role: "user", content: "Hello" }],
      );
      const formatted = bound.format();
      expect(formatted.promptInfo.modelParameters).toEqual({
        max_output_tokens: 1024,
        temperature: 0.5,
      });
    });

    test("maps parameters for gemini_api_chat flavor", () => {
      const bound = new BoundPrompt(
        geminiPromptInfo("gemini_api_chat"),
        [{ role: "user", content: "Hello" }],
      );
      const formatted = bound.format();
      expect(formatted.promptInfo.modelParameters).toEqual({
        max_output_tokens: 1024,
        temperature: 0.5,
      });
    });

    test("does not map parameters for non-Gemini flavors", () => {
      const promptInfo: PromptInfo = {
        promptTemplateId: "test-id",
        promptTemplateVersionId: "test-version-id",
        templateName: "test-template",
        modelParameters: { max_tokens: 1024, temperature: 0.5 },
        provider: "openai",
        model: "gpt-4",
        flavorName: "openai_chat",
      };

      const bound = new BoundPrompt(promptInfo, [
        { role: "user", content: "Hello" },
      ]);
      const formatted = bound.format();
      expect(formatted.promptInfo.modelParameters).toEqual({
        max_tokens: 1024,
        temperature: 0.5,
      });
    });

    test("maps parameters when overriding to gemini flavor", () => {
      const promptInfo: PromptInfo = {
        promptTemplateId: "test-id",
        promptTemplateVersionId: "test-version-id",
        templateName: "test-template",
        modelParameters: { max_tokens: 2048, thinking_level: "low" },
        provider: "openai",
        model: "gpt-4",
        flavorName: "openai_chat",
      };

      const bound = new BoundPrompt(promptInfo, [
        { role: "user", content: "Hello" },
      ]);
      const formatted = bound.format("gemini_api_chat");
      expect(formatted.promptInfo.modelParameters).toEqual({
        max_output_tokens: 2048,
        thinking_config: { thinking_level: "low" },
      });
      expect(formatted.promptInfo.flavorName).toBe("gemini_api_chat");
    });
  });

  test("output schema with unsupported provider throws error", () => {
    const outputSchema = {
      type: "object",
      properties: {
        response: { type: "string" },
      },
    };

    const promptInfo: PromptInfo = {
      promptTemplateId: "test-id",
      promptTemplateVersionId: "test-version-id",
      templateName: "test-template",
      modelParameters: {},
      provider: "anthropic",
      model: "claude-3-opus",
      flavorName: "anthropic_chat",
    };

    const boundPrompt = new BoundPrompt(
      promptInfo,
      [{ role: "user", content: "User message" }],
      undefined,
      outputSchema,
    );

    expect(() => boundPrompt.format()).toThrow(
      "Structured outputs are not supported for this model and provider.",
    );
  });
});
