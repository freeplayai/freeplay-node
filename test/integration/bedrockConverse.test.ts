import Freeplay, {
  getCallInfo,
  getSessionInfo,
  BedrockConverseAdapter,
} from "../../src";
import {
  describeIntegrationTest as describe,
  requireEnv,
} from "../test_support";

describe("bedrock converse integration", () => {
  const projectId = requireEnv("EXAMPLES_PROJECT_ID");
  const freeplay = new Freeplay({
    freeplayApiKey: requireEnv("FREEPLAY_API_KEY"),
    baseUrl: `${requireEnv("FREEPLAY_API_URL")}/api`,
  });

  test("basic converse", async () => {
    // Import AWS SDK only inside test to avoid circular reference issues with Jest
    const { BedrockRuntimeClient, ConverseCommand } = await import(
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
    const inputVariables = { question: "What is the capital of France?" };

    const promptTemplate = await freeplay.prompts.get({
      projectId,
      templateName: "bedrock-converse",
      environment: "latest",
    });

    const boundPrompt = promptTemplate.bind(inputVariables, []);
    const adapter = new BedrockConverseAdapter();
    const convertedMessages = adapter.toLLMSyntax(boundPrompt.messages);

    const start = new Date();

    const systemMessage = boundPrompt.messages.find((m) => m.role === "system");
    const systemContent =
      typeof systemMessage?.content === "string" ? systemMessage.content : "";

    const command = new ConverseCommand({
      modelId: boundPrompt.promptInfo.model,
      messages: convertedMessages as any[],
      system: [{ text: systemContent }],
      inferenceConfig: boundPrompt.promptInfo.modelParameters as any,
    });

    const response = await converseClient.send(command);
    const end = new Date();

    converseClient.destroy();

    const outputMessage = response.output?.message;
    expect(outputMessage).toBeDefined();
    expect(outputMessage?.content).toBeDefined();
    expect(outputMessage?.content?.[0]).toHaveProperty("text");

    const responseContent = (outputMessage?.content?.[0] as any)?.text || "";
    expect(responseContent.toLowerCase()).toContain("paris");

    // Convert messages to recording format
    const recordMessages = [
      ...convertedMessages,
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
      inputs: inputVariables,
      sessionInfo: getSessionInfo(session),
      promptVersionInfo: boundPrompt.promptInfo,
      callInfo: getCallInfo(boundPrompt.promptInfo, start, end),
      responseInfo: {
        isComplete: true,
      },
    });
  }, 30_000);

  test("converse with tool calls", async () => {
    // Import AWS SDK only inside test to avoid circular reference issues with Jest
    const { BedrockRuntimeClient, ConverseCommand } = await import(
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
    const equation = "5 + 3";
    const inputVariables = { equation };

    // Define tool functions
    function addNumbers(numbers: number[]): number {
      return numbers.reduce((a, b) => a + b, 0);
    }

    // Tool specification
    const toolsSpec = [
      {
        toolSpec: {
          name: "add_numbers",
          description: "Add a list of numbers",
          inputSchema: {
            json: {
              type: "object",
              properties: {
                numbers: {
                  type: "array",
                  items: { type: "number" },
                  description: "List of numbers to add",
                },
              },
              required: ["numbers"],
            },
          },
        },
      },
    ];

    const promptTemplate = await freeplay.prompts.get({
      projectId,
      templateName: "nova_tool_call",
      environment: "latest",
    });

    const boundPrompt = promptTemplate.bind(inputVariables, []);
    const adapter = new BedrockConverseAdapter();
    const convertedMessages = adapter.toLLMSyntax(boundPrompt.messages);

    const history: any[] = [...convertedMessages];

    let finishReason: string | undefined;
    let toolCallMade = false;

    // Tool call loop (single iteration for test)
    while (finishReason !== "end_turn" && finishReason !== "stop_sequence") {
      const start = new Date();

      const systemMessage = boundPrompt.messages.find(
        (m) => m.role === "system",
      );
      const systemContent =
        typeof systemMessage?.content === "string" ? systemMessage.content : "";

      const command = new ConverseCommand({
        modelId: boundPrompt.promptInfo.model,
        messages: history as any[],
        system: [{ text: systemContent }],
        inferenceConfig: boundPrompt.promptInfo.modelParameters as any,
        toolConfig: { tools: toolsSpec as any },
      });

      const response = await converseClient.send(command);
      const end = new Date();

      const outputMessage = response.output?.message;
      finishReason = response.stopReason;

      if (finishReason === "tool_use") {
        toolCallMade = true;

        // Find the toolUse in content
        let toolUse: any = null;
        for (const contentItem of outputMessage?.content || []) {
          if ((contentItem as any).toolUse) {
            toolUse = (contentItem as any).toolUse;
            break;
          }
        }

        expect(toolUse).toBeDefined();
        expect(toolUse.name).toBe("add_numbers");

        const toolInput = toolUse.input;
        const result = addNumbers(toolInput.numbers);

        expect(result).toBe(8); // 5 + 3 = 8

        // Add assistant message to history
        history.push({
          role: outputMessage?.role,
          content: outputMessage?.content?.map((c: any) => {
            if (c.toolUse) {
              return {
                toolUse: {
                  toolUseId: c.toolUse.toolUseId,
                  name: c.toolUse.name,
                  input: c.toolUse.input,
                },
              };
            }
            return { text: c.text };
          }),
        });

        // Add tool result to history
        history.push({
          role: "user",
          content: [
            {
              toolResult: {
                toolUseId: toolUse.toolUseId,
                content: [{ text: String(result) }],
              },
            },
          ],
        });

        // Record the tool call
        await freeplay.recordings.create({
          projectId,
          allMessages: history,
          inputs: inputVariables,
          sessionInfo: getSessionInfo(session),
          promptVersionInfo: boundPrompt.promptInfo,
          callInfo: getCallInfo(boundPrompt.promptInfo, start, end),
        });

        // Break after one tool call for test
        break;
      }
    }

    expect(toolCallMade).toBe(true);

    converseClient.destroy();
  }, 30_000);
});
