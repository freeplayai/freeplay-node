import * as fs from "node:fs";
import * as path from "node:path";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  MediaInputMap,
  SessionInfo,
  BedrockConverseAdapter,
} from "../../src";
import {
  describeIntegrationTest as describe,
  requireEnv,
} from "../test_support";

describe("bedrock converse media integration", () => {
  const projectId = requireEnv("EXAMPLES_PROJECT_ID");
  const freeplay = new Freeplay({
    freeplayApiKey: requireEnv("FREEPLAY_API_KEY"),
    baseUrl: `${requireEnv("FREEPLAY_API_URL")}/api`,
  });

  async function call(
    converseClient: any,
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    media?: MediaInputMap,
  ): Promise<string> {
    const promptTemplate = await freeplay.prompts.get({
      projectId,
      templateName,
      environment: "latest",
    });

    const boundPrompt = promptTemplate.bind(input_variables, undefined, media);
    const adapter = new BedrockConverseAdapter();
    const _convertedMessages = adapter.toLLMSyntax(boundPrompt.messages);

    const start = new Date();

    // For the actual Bedrock call, we need to construct messages with raw image bytes
    const imageBase64 =
      media?.["city-image"]?.type === "base64"
        ? (media["city-image"] as any).data
        : "";
    const imageBytes = Buffer.from(imageBase64, "base64");

    const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");

    const bedrockMessages: any[] = [
      {
        role: "user",
        content: [
          {
            image: {
              format: "jpeg",
              source: {
                bytes: new Uint8Array(imageBytes),
              },
            },
          },
          { text: input_variables.question },
        ],
      },
    ];

    const systemMessage = boundPrompt.messages.find((m) => m.role === "system");
    const systemContent =
      typeof systemMessage?.content === "string" ? systemMessage.content : "";

    const command = new ConverseCommand({
      modelId: boundPrompt.promptInfo.model,
      messages: bedrockMessages,
      system: [{ text: systemContent }],
      inferenceConfig: boundPrompt.promptInfo.modelParameters as any,
    });

    const response = await converseClient.send(command);
    const end = new Date();

    const outputMessage = response.output?.message;
    const responseContent = (outputMessage?.content?.[0] as any)?.text || "";

    // Record using plain Bedrock Converse message format
    // Media will be handled by the backend via media_inputs
    const recordMessages = [
      { role: "user", content: [{ text: input_variables.question }] },
      {
        role: outputMessage?.role,
        content: outputMessage?.content?.map((c: any) => ({
          text: c.text,
        })),
      },
    ];

    await freeplay.recordings.create({
      projectId,
      allMessages: recordMessages as any[],
      inputs: input_variables,
      mediaInputs: media,
      sessionInfo: session_info,
      promptVersionInfo: boundPrompt.promptInfo,
      callInfo: getCallInfo(boundPrompt.promptInfo, start, end),
      responseInfo: {
        isComplete: true,
      },
    });

    return responseContent;
  }

  test("media - image in template", async () => {
    // Import AWS SDK only inside test to avoid circular reference issues with Jest
    const { BedrockRuntimeClient } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );

    const converseClient = new BedrockRuntimeClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    });
    const session = freeplay.sessions.create();
    const imageData = fs.readFileSync(
      path.join(__dirname, "..", "test_files", "media", "whale.jpg"),
      { encoding: "base64" },
    );

    const media: MediaInputMap = {
      "city-image": {
        type: "base64",
        content_type: "image/jpeg",
        data: imageData,
      },
    };

    const response = await call(
      converseClient,
      "nova_image_test",
      { question: "Describe what you see" },
      getSessionInfo(session),
      media,
    );

    expect(response.toLowerCase()).toContain("whale");

    converseClient.destroy();
  }, 30_000);
});
