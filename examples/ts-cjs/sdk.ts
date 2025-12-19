import Anthropic from "@anthropic-ai/sdk";
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";

async function main() {
  const anthropicClient = new Anthropic({
    apiKey: process.env["ANTHROPIC_API_KEY"],
  });
  const fpClient = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"],
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const variables = {
    location: "SF",
  };

  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId: process.env["FREEPLAY_PROJECT_ID"],
    templateName: "my-anthropic-prompt",
    environment: "latest",
    variables,
  });

  const start = new Date();
  const anthropicResponse = await anthropicClient.messages.create({
    model: formattedPrompt.promptInfo.model,
    // @ts-expect-error -- TODO: Fix types
    messages: formattedPrompt.llmPrompt,
    system: formattedPrompt.systemContent,
    tools: formattedPrompt.toolSchema,
    ...formattedPrompt.promptInfo.modelParameters,
  });
  const end = new Date();

  const messages = formattedPrompt.allMessages({
    content: anthropicResponse.content,
    role: anthropicResponse.role,
  });

  const session = fpClient.sessions.create();

  const completionResponse = await fpClient.recordings.create({
    projectId: process.env["FREEPLAY_PROJECT_ID"] as string,
    allMessages: messages,
    inputs: variables,
    sessionInfo: getSessionInfo(session),
    toolSchema: formattedPrompt.toolSchema,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: "stop_sequence" === anthropicResponse.stop_reason,
    },
  });

  await fpClient.customerFeedback.update({
    completionId: completionResponse.completionId,
    customerFeedback: { feedback: "it is just ok" },
  });

  console.log({ toolSchema: formattedPrompt.toolSchema });
  console.log("Session: ", session);
  console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
  console.log("Response: ", anthropicResponse);
}

main().catch(console.error);
