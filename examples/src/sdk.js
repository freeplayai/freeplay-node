import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "my-anthropic-prompt";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});
const anthropicClient = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

let session = await fpClient.sessions.create({
  customMetadata: { some_custom_metadata: 42 },
});

let variables = { question: "Why isn't my sink working" };

let formattedPrompt = await fpClient.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables,
});

let start = new Date();
const anthropicResponse = await anthropicClient.messages.create({
  model: formattedPrompt.promptInfo.model,
  messages: formattedPrompt.llmPrompt,
  system: formattedPrompt.systemContent,
  ...formattedPrompt.promptInfo.modelParameters,
});
let end = new Date();

let messages = formattedPrompt.allMessages({
  content: anthropicResponse.content[0].text,
  role: "assistant",
});

const usage = {
  promptTokens: anthropicResponse.usage.input_tokens,
  completionTokens: anthropicResponse.usage.output_tokens,
};
const completionResponse = await fpClient.recordings.create({
  projectId,
  allMessages: messages,
  inputs: variables,
  sessionInfo: getSessionInfo(session),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(
    formattedPrompt.promptInfo,
    start,
    end,
    usage,
    "default",
  ),
  responseInfo: {
    isComplete: "stop_sequence" === anthropicResponse.stop_reason,
  },
});

await fpClient.customerFeedback.update({
  completionId: completionResponse.completionId,
  customerFeedback: { feedback: "it is just ok" },
});

console.log("Session: ", session);
console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", anthropicResponse);
