import Anthropic from "@anthropic-ai/sdk";
import { ContentBlock, MessageParam } from "@anthropic-ai/sdk/resources";
import Freeplay, { SessionInfo, getCallInfo, getSessionInfo } from "../../src";
import { describeIntegrationTest } from "../test_support";

describeIntegrationTest("anthropic_integration", () => {
  const projectId = process.env["EXAMPLES_PROJECT_ID"]!;
  const freeplay = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"]!,
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const anthropic = new Anthropic({
    apiKey: process.env["ANTHROPIC_API_KEY"],
  });

  async function call(
    templateName: string,
    input_variables: Record<string, string>,
    session_info: SessionInfo,
    history: MessageParam[],
  ): Promise<ContentBlock[]> {
    const formattedPrompt = await freeplay.prompts.getFormatted<MessageParam>({
      projectId,
      templateName,
      environment: "latest",
      variables: input_variables,
      history,
    });

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
          ...history,
          {
            role: "assistant",
            content: contentCopy,
          },
        ],
        inputs: input_variables,
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
        "chat",
        {},
        getSessionInfo(session),
        history,
      );
      history.push({
        role: "assistant",
        content: botResponse,
      });
    }
  }, 30000);

  test("media", async () => {
    const session = freeplay.sessions.create();
    const history: MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg",
            },
          },
          {
            type: "text",
            text: "Describe this image.",
          },
        ],
      },
    ];

    await call("chat", {}, getSessionInfo(session), history);
  }, 30000);
});
