import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "media";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: process.env["FREEPLAY_API_URL"] + "/api",
});

const inputVariables = {
  question: "Describe what's in this image",
};

const promptTemplate = await fpClient.prompts.get({
  projectId,
  templateName,
  environment,
});

const imageData = await fetch(
  "https://upload.wikimedia.org/wikipedia/commons/4/46/Colorful_underwater_landscape_of_a_coral_reef.jpg",
).then((response) => response.arrayBuffer());

const imageBase64 = Buffer.from(imageData).toString("base64");

const mediaInputs = {
  "some-image": {
    type: "base64",
    content_type: "image/jpeg",
    data: imageBase64,
  },
};
const formattedPrompt = promptTemplate
  .bind(inputVariables, undefined, mediaInputs)
  .format("anthropic_chat");

let start = new Date();

const result = await client.messages.create({
  messages: formattedPrompt.llmPrompt,
  model: "claude-3-5-sonnet-latest",
  max_tokens: 1_000,
  ...formattedPrompt.promptInfo.modelParameters,
});

const returnContent = result.content;
let end = new Date();

await fpClient.recordings.create({
  projectId,
  allMessages: [
    ...formattedPrompt.llmPrompt,
    {
      role: "assistant",
      content: returnContent,
    },
  ],
  inputs: inputVariables,
  mediaInputs,
  sessionInfo: getSessionInfo(fpClient.sessions.create()),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: { isComplete: true },
});

console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", returnContent);
