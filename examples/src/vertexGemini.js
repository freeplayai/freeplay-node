import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import { VertexAI } from "@google-cloud/vertexai";
import _ from "lodash";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "my-gemini-prompt";
const googleProjectid = process.env["EXAMPLES_VERTEX_PROJECT_ID"];

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
const vertexAI = new VertexAI({
  project: googleProjectid,
  location: "us-central1",
});

const camelParams = {};
for (const param in formattedPrompt.promptInfo.modelParameters) {
  camelParams[_.camelCase(param)] =
    formattedPrompt.promptInfo.modelParameters[param];
}

const generativeModel = vertexAI.getGenerativeModel({
  model: formattedPrompt.promptInfo.model,
  generationConfig: camelParams,
  systemInstruction: formattedPrompt.systemContent,
});

const result = await generativeModel.generateContent({
  contents: formattedPrompt.llmPrompt,
});
const response = result.response;

const returnContent = response.candidates[0].content.parts[0].text;
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
