import Anthropic from "@anthropic-ai/sdk";
import Freeplay, {
  FilesystemTemplateResolver,
  getCallInfo,
  getSessionInfo,
} from "freeplay";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "prod";
const templateName = "my-prompt-anthropic";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  templateResolver: new FilesystemTemplateResolver(
    process.env["FREEPLAY_TEMPLATE_DIRECTORY"],
  ),
});
const anthropicClient = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
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

let session = await fpClient.sessions.create();
let recordData = {
  projectId,
  allMessages: messages,
  inputs: variables,
  sessionInfo: getSessionInfo(session),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: {
    isComplete: "stop_sequence" === anthropicResponse.stop_reason,
  },
};
const recordResponse = await fpClient.recordings.create(recordData);

console.log("Session: ", session);
console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", anthropicResponse);
console.log("Record: ", recordResponse);
