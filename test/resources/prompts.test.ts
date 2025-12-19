import {
  BoundPrompt,
  extractMediaContent,
  MediaInputMap,
  MediaSlot,
  PromptInfo,
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
