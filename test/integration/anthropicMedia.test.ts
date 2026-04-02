import * as fs from "node:fs";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  ContentBlock,
  MessageParam,
  TextBlock,
} from "@anthropic-ai/sdk/resources";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  MediaInputMap,
  SessionInfo,
} from "../../src";
import {
  describeIntegrationTest as describe,
  requireEnv,
} from "../test_support";

describe("anthropic media integration", () => {
  const projectId = requireEnv("EXAMPLES_PROJECT_ID");
  const freeplay = new Freeplay({
    freeplayApiKey: requireEnv("FREEPLAY_API_KEY"),
    baseUrl: `${requireEnv("FREEPLAY_API_URL")}/api`,
  });

  const anthropic = new Anthropic({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
  });

  async function call(
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    media?: MediaInputMap,
  ): Promise<ContentBlock[]> {
    const formattedPrompt = await freeplay.prompts.getFormatted<MessageParam>({
      projectId,
      templateName,
      environment: "latest",
      variables: input_variables,
      media,
      flavorName: "anthropic_chat",
    });
    formattedPrompt.promptInfo.modelParameters.model =
      "claude-3-5-haiku-latest";
    formattedPrompt.promptInfo.modelParameters.max_tokens = 2000;

    const start = new Date();

    try {
      const response = await anthropic.messages.create({
        model: formattedPrompt.promptInfo.model,
        messages: formattedPrompt.llmPrompt!,
        system: formattedPrompt.systemContent,
        ...(formattedPrompt.promptInfo.modelParameters as {
          max_tokens: number;
        }),
      });
      const end = new Date();

      // Create a clean copy of the response content
      const contentCopy = response.content
        ? response.content.map((block) => ({ ...block }))
        : [];

      await freeplay.recordings.create({
        projectId,
        allMessages: [
          ...(formattedPrompt.llmPrompt || []),
          {
            role: "assistant",
            content: contentCopy,
          },
        ],
        inputs: input_variables,
        mediaInputs: media,
        sessionInfo: session_info,
        promptVersionInfo: formattedPrompt.promptInfo,
        callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
        responseInfo: {
          isComplete: true,
        },
      });

      return contentCopy;
    } catch (error) {
      console.error("Error calling Anthropic:", error);
      throw error;
    }
  }

  test("media - image in template", async () => {
    const session = freeplay.sessions.create();
    const imageData = fs.readFileSync(
      path.join(__dirname, "..", "test_files", "media", "whale.jpg"),
      { encoding: "base64" },
    );

    const media: MediaInputMap = {
      "some-image": {
        type: "base64",
        content_type: "image/jpeg",
        data: imageData,
      },
    };

    const response = await call(
      "media-image",
      { query: "Describe what you see" },
      getSessionInfo(session),
      media,
    );

    expect((response[0] as TextBlock).text).toContain("whale");
  }, 30_000);

  test("media - pdf in template", async () => {
    const session = freeplay.sessions.create();
    const documentData = fs.readFileSync(
      path.join(__dirname, "..", "test_files", "media", "portugal.pdf"),
      { encoding: "base64" },
    );

    const media: MediaInputMap = {
      "some-file": {
        type: "base64",
        content_type: "application/pdf",
        data: documentData,
      },
    };

    const response = await call(
      "media-file",
      { query: "Describe this document" },
      getSessionInfo(session),
      media,
    );

    expect((response[0] as TextBlock).text).toContain("Portugal");
  }, 30_000);
});
