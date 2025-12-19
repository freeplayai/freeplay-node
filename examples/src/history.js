import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "dev";
const templateName = "History-QA";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});
const anthropicClient = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

async function call(
  projectId,
  templateName,
  environment,
  input_variables,
  history,
  session_info,
  trace_info,
) {
  let formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName,
    environment,
    variables: input_variables,
    history: history,
  });

  console.log("Prompt", formattedPrompt.llmPrompt);
  let start = new Date();
  const llmResponse = await anthropicClient.messages.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    system: formattedPrompt.systemContent,
    ...formattedPrompt.promptInfo.modelParameters,
  });
  let end = new Date();

  const llmResponseText = llmResponse.content[0].text;

  let messages = formattedPrompt.allMessages({
    content: llmResponseText,
    role: "assistant",
  });

  const completionResponse = await fpClient.recordings.create({
    projectId,
    allMessages: messages,
    inputs: input_variables,
    sessionInfo: session_info,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: "stop_sequence" === llmResponse.stop_reason,
    },
    traceInfo: trace_info,
  });

  return {
    completionId: completionResponse.completionId,
    userMessages: formattedPrompt.llmPrompt,
    llmResponseText: llmResponseText,
  };
}

const articles = [
  "george washington was the first president of the united states",
  "the sky is blue",
  "the earth is round",
  "",
];

const questions = [
  "who was the first president of the united states?",
  "what color is the sky?",
  "what shape is the earth?",
  "repeat the first question and answer",
];

const inputPairs = articles.map((article, index) => [
  article,
  questions[index],
]);

async function main() {
  const session = await fpClient.sessions.create();

  const history_messages = [];

  for (const [article, question] of inputPairs) {
    const traceInfo = await session.createTrace(question);
    const botResponse = await call(
      projectId,
      templateName,
      environment,
      { question: question, article: article },
      history_messages,
      getSessionInfo(session),
      traceInfo,
    );
    // update history
    history_messages.push(...botResponse.userMessages);
    history_messages.push({
      content: botResponse.llmResponseText,
      role: "assistant",
    });
    console.log("Bot response: ", botResponse.llmResponseText);
    await traceInfo.recordOutput(projectId, botResponse.llmResponseText);
  }
}

main().catch(console.error);
