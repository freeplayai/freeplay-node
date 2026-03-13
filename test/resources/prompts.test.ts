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

  test("media messages in allMessages have provider format, not internal content_part_type", () => {
    const promptInfo: PromptInfo = {
      promptTemplateId: "test-id",
      promptTemplateVersionId: "test-version-id",
      templateName: "test-template",
      modelParameters: {},
      provider: "openai",
      model: "gpt-4o",
      flavorName: "openai_responses",
    };

    const messages: TemplateMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: "Describe this image: {{description}}",
        media_slots: [{ type: "image", placeholder_name: "photo" }],
      },
    ];

    const media: MediaInputMap = {
      photo: {
        type: "base64",
        content_type: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUg==",
      },
    };

    const templatePrompt = new TemplatePrompt(promptInfo, messages);
    const boundPrompt = templatePrompt.bind(
      { description: "a sunset" },
      undefined,
      media,
    );
    const formattedPrompt = boundPrompt.format("openai_responses");

    const completionOutput = {
      role: "assistant",
      content: "It shows a beautiful sunset.",
    };
    const allMsgs = formattedPrompt.allMessages(completionOutput);

    // allMessages should be JSON-serializable (JS objects always are, but verify no cycles etc.)
    expect(() => JSON.stringify(allMsgs)).not.toThrow();

    // No content block should have the internal `content_part_type` field
    for (const msg of allMsgs) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          expect(block).not.toHaveProperty("content_part_type");
          expect(block).not.toHaveProperty("slot_name");
          expect(block).not.toHaveProperty("slot_type");
        }
      }
    }

    // System message should be preserved in allMessages
    const systemMsg = allMsgs.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toBe("You are a helpful assistant.");

    // The user message should have provider-formatted content blocks with `type`, not `content_part_type`
    const userMsg = allMsgs.find(
      (m) => m.role === "user" && Array.isArray(m.content),
    );
    expect(userMsg).toBeDefined();
    for (const block of userMsg!.content as Array<Record<string, any>>) {
      expect(block).toHaveProperty("type");
    }
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
