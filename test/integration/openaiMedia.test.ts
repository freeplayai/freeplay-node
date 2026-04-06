import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import {
  describeIntegrationTest as describe,
  requireEnv,
} from "../test_support";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  MediaInputMap,
  SessionInfo,
} from "../../src";

describe("openai media integration", () => {
  const projectId = requireEnv("EXAMPLES_PROJECT_ID");
  const freeplay = new Freeplay({
    freeplayApiKey: requireEnv("FREEPLAY_API_KEY"),
    baseUrl: `${requireEnv("FREEPLAY_API_URL")}/api`,
  });
  const openai = new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
  });

  async function call(
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    model_name: string,
    media?: MediaInputMap,
  ): Promise<string | null> {
    const formattedPrompt =
      await freeplay.prompts.getFormatted<ChatCompletionMessageParam>({
        projectId,
        templateName,
        environment: "latest",
        variables: input_variables,
        media,
        flavorName: "openai_chat",
      });
    formattedPrompt.promptInfo.modelParameters.model = model_name;
    formattedPrompt.promptInfo.modelParameters.max_tokens = 2000;

    const start = new Date();

    try {
      const response = await openai.chat.completions.create({
        messages: formattedPrompt.llmPrompt!,
        model: formattedPrompt.promptInfo.model,
        ...formattedPrompt.promptInfo.modelParameters,
      });
      const end = new Date();

      const content = response.choices[0].message.content;
      await freeplay.recordings.create({
        projectId,
        allMessages: [
          ...(formattedPrompt.llmPrompt || []),
          {
            role: "assistant",
            content,
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

      return content;
    } catch (error) {
      console.error("Error calling OpenAI:", error);
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
      "gpt-4o",
      media,
    );

    expect(response).toContain("whale");
  }, 30_000);

  test("media - audio in template", async () => {
    const session = freeplay.sessions.create();
    const audioData = fs.readFileSync(
      path.join(__dirname, "..", "test_files", "media", "birds.mp3"),
      { encoding: "base64" },
    );

    const media: MediaInputMap = {
      "some-audio": {
        type: "base64",
        content_type: "audio/mpeg",
        data: audioData,
      },
    };

    const response = await call(
      "media-audio",
      { query: "Describe what you hear" },
      getSessionInfo(session),
      "gpt-4o-audio-preview",
      media,
    );

    expect(response).toContain("bird");
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
      "gpt-4o",
      media,
    );

    expect(response).toContain("Portugal");
  }, 30_000);
});
