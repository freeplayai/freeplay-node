import * as fs from "node:fs";
import * as path from "node:path";
import { Content, GoogleGenerativeAI } from "@google/generative-ai";
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

describe("gemini media integration", () => {
  const projectId = requireEnv("EXAMPLES_PROJECT_ID");
  const freeplay = new Freeplay({
    freeplayApiKey: requireEnv("FREEPLAY_API_KEY"),
    baseUrl: `${requireEnv("FREEPLAY_API_URL")}/api`,
  });
  const genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));

  async function call(
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    media?: MediaInputMap,
  ): Promise<string | undefined> {
    const formattedPrompt = await freeplay.prompts.getFormatted<Content>({
      projectId,
      templateName,
      environment: "latest",
      variables: input_variables,
      media,
      flavorName: "gemini_chat",
    });
    formattedPrompt.promptInfo.model = "gemini-2.0-flash";
    formattedPrompt.promptInfo.modelParameters.max_tokens = 2000;

    const generativeModel = genAI.getGenerativeModel({
      model: formattedPrompt.promptInfo.model,
      generationConfig: { maxOutputTokens: 2000 },
      systemInstruction: formattedPrompt.systemContent,
    });

    const start = new Date();

    try {
      const result = await generativeModel.generateContent({
        contents: formattedPrompt.llmPrompt || [],
      });
      const end = new Date();

      const content = result.response.candidates![0].content.parts[0].text;
      await freeplay.recordings.create({
        projectId,
        allMessages: [
          ...(formattedPrompt.llmPrompt || []),
          {
            role: "model",
            parts: [{ text: content }],
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
      console.error("Error calling Gemini:", error);
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
      media,
    );

    expect(response).toContain("Portugal");
  }, 30_000);
});
