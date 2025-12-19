import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import fetch from "node-fetch";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "my-baseten-mistral-prompt";
const modelId = process.env["BASETEN_MODEL_ID"];
const basetenApiKey = process.env["BASETEN_API_KEY"];

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

let inputVariables = { question: "Why is the sky blue?" };
let formattedPrompt = await fpClient.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables: inputVariables,
});

let session = await fpClient.sessions.create();

let start = new Date();
const response = await fetch(
  `https://model-${modelId}.api.baseten.co/production/predict`,
  {
    method: "POST",
    headers: { Authorization: `Api-Key ${basetenApiKey}` },
    body: JSON.stringify({
      messages: formattedPrompt.llmPrompt,
      ...formattedPrompt.promptInfo.modelParameters,
    }),
  },
);

const returnContent = await response.text();
let end = new Date();

let messages = formattedPrompt.allMessages({
  role: "assistant",
  content: returnContent,
});

await fpClient.recordings.create({
  projectId,
  allMessages: messages,
  inputs: inputVariables,
  sessionInfo: getSessionInfo(session),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: { isComplete: true },
});

console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", returnContent);
