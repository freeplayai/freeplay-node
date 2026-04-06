import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import Freeplay, {
  ProviderMessage,
  SessionInfo,
  getCallInfo,
  getSessionInfo,
} from "../../src";
import { describeIntegrationTest } from "../test_support";

describeIntegrationTest("combined_integration", () => {
  const projectId = process.env["EXAMPLES_PROJECT_ID"]!;
  const freeplay = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"]!,
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const anthropic = new Anthropic({
    apiKey: process.env["ANTHROPIC_API_KEY"],
  });
  const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  async function call<MessageType extends ProviderMessage>(
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    history: MessageType[],
  ): Promise<MessageType> {
    const start = new Date();

    try {
      const promptTemplate = await freeplay.prompts.get({
        projectId,
        templateName,
        environment: "latest",
      });
      const boundPrompt = promptTemplate.bind(input_variables, history);
      let responseMessage: MessageType;

      if (boundPrompt.promptInfo.provider === "anthropic") {
        const formattedPrompt = boundPrompt.format<MessageParam>();
        const response = await anthropic.messages.create({
          model: formattedPrompt.promptInfo.model,
          messages: formattedPrompt.llmPrompt!,
          system: formattedPrompt.systemContent,
          ...(formattedPrompt.promptInfo.modelParameters as {
            max_tokens: number;
          }),
        });

        // Create clean copy without potential circular references
        const contentCopy = response.content
          ? response.content.map((block) => ({ ...block }))
          : [];

        responseMessage = {
          role: "assistant",
          content: contentCopy,
        } as ProviderMessage as MessageType;
      } else if (boundPrompt.promptInfo.provider === "openai") {
        const formattedPrompt =
          boundPrompt.format<ChatCompletionMessageParam>();
        const response = await openai.chat.completions.create({
          model: formattedPrompt.promptInfo.model,
          messages: formattedPrompt.llmPrompt!,
          ...formattedPrompt.promptInfo.modelParameters,
        });

        // Create clean copy without potential circular references
        const message = response.choices[0].message;
        responseMessage = {
          role: message.role,
          content: message.content,
        } as ProviderMessage as MessageType;

        // Handle any additional fields from the original message
        if (message.function_call) {
          (responseMessage as any).function_call = {
            name: message.function_call.name,
            arguments: message.function_call.arguments,
          };
        }

        if (message.tool_calls) {
          (responseMessage as any).tool_calls = message.tool_calls.map(
            (tc) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            }),
          );
        }
      } else {
        throw new Error(
          `Unsupported provider: ${boundPrompt.promptInfo.provider}`,
        );
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
        },
      });

      return responseMessage;
    } catch (error) {
      console.error("Error calling provider:", error);
      throw error;
    }
  }

  test("basics", async () => {
    const session = freeplay.sessions.create();
    const history: MessageParam[] = [];

    const userQuestions = [
      "Why did the sphinx crumble?",
      "And why do you think that is?",
    ];
    for (const question of userQuestions) {
      history.push({
        role: "user",
        content: question,
      });
      const botResponse = await call(
        "barty",
        {},
        getSessionInfo(session),
        history,
      );
      history.push(botResponse);
    }
  }, 30000);
});
