import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import Freeplay, {
  FormattedToolSchema,
  OpenAIToolCall,
  ProviderMessage,
  SessionInfo,
  getCallInfo,
  getSessionInfo,
} from "../../src";
import { describeIntegrationTest } from "../test_support";

// Define the OpenAI response message type to include tool_calls
type OpenAIResponseMessage = ProviderMessage & {
  tool_calls?: OpenAIToolCall[];
};

describeIntegrationTest("tools_integration", () => {
  const projectId = process.env["EXAMPLES_PROJECT_ID"]!;
  const freeplay = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"]!,
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  async function call(
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    history: ProviderMessage[],
    tools?: FormattedToolSchema[],
  ): Promise<OpenAIResponseMessage> {
    const start = new Date();

    const promptTemplate = await freeplay.prompts.get({
      projectId,
      templateName,
      environment: "latest",
    });
    const boundPrompt = promptTemplate.bind(input_variables, history);

    const formattedPrompt = boundPrompt.format<ChatCompletionMessageParam>();

    try {
      const response = await openai.chat.completions.create({
        model: formattedPrompt.promptInfo.model,
        messages: formattedPrompt.llmPrompt!,
        ...formattedPrompt.promptInfo.modelParameters,
        ...(tools && { tools }),
      });

      // Create a clean copy of the response message without circular references
      const message = response.choices[0].message;
      const responseMessage: OpenAIResponseMessage = {
        role: message.role,
        content: message.content,
      };

      // Only copy tool_calls if present
      if (message.tool_calls) {
        responseMessage.tool_calls = message.tool_calls.map((tc) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      }

      const end = new Date();

      await freeplay.recordings.create({
        projectId,
        allMessages: [...history, responseMessage],
        inputs: input_variables,
        sessionInfo: session_info,
        promptVersionInfo: boundPrompt.promptInfo,
        callInfo: getCallInfo(boundPrompt.promptInfo, start, end),
        responseInfo: {
          isComplete: true,
          ...(responseMessage.tool_calls && {
            functionCallResponse: {
              function_name:
                responseMessage.tool_calls[0]?.function?.name || "",
              arguments:
                responseMessage.tool_calls[0]?.function?.arguments || "",
            },
          }),
        },
        ...(tools && { toolSchema: tools }),
      });

      return responseMessage;
    } catch (error) {
      console.error("Error calling OpenAI:", error);
      throw error;
    }
  }

  const tools = [
    {
      type: "function",
      function: {
        name: "get_current_weather",
        description: "Get the current weather",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state, e.g. San Francisco, CA",
            },
            format: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description:
                "The temperature unit to use. Infer this from the users location.",
            },
          },
          required: ["location", "format"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_n_day_weather_forecast",
        description: "Get an N-day weather forecast",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state, e.g. San Francisco, CA",
            },
            format: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description:
                "The temperature unit to use. Infer this from the users location.",
            },
            num_days: {
              type: "integer",
              description: "The number of days to forecast",
            },
          },
          required: ["location", "format", "num_days"],
        },
      },
    },
  ];

  test("function calling", async () => {
    const session = freeplay.sessions.create();
    const history: ProviderMessage[] = [
      {
        role: "user",
        content: "What's the current weather in San Francisco?",
      },
    ];

    const response = await call(
      "chat",
      {},
      getSessionInfo(session),
      history,
      tools,
    );

    expect(response.tool_calls).toBeDefined();
    expect(response.tool_calls?.[0]?.function?.name).toBe(
      "get_current_weather",
    );

    const args = JSON.parse(
      response.tool_calls?.[0]?.function?.arguments || "{}",
    );
    expect(args.location).toBe("San Francisco");
  }, 30000);
});
