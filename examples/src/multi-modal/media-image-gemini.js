import { GoogleGenerativeAI } from "@google/generative-ai";
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import _ from "lodash";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "media";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const freeplay = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: process.env["FREEPLAY_API_URL"] + "/api",
});

const inputVariables = {
  question: "Describe what's in this image",
};

const promptTemplate = await freeplay.prompts.get({
  projectId,
  templateName,
  environment,
});

const imageData = await fetch(
  "https://upload.wikimedia.org/wikipedia/commons/4/46/Colorful_underwater_landscape_of_a_coral_reef.jpg",
).then((response) => response.arrayBuffer());

const imageBase64 = Buffer.from(imageData).toString("base64");

promptTemplate.promptInfo.model = "gemini-2.0-flash";

const mediaInputs = {
  "some-image": {
    type: "base64",
    content_type: "image/jpeg",
    data: imageBase64,
  },
};

const formattedPrompt = promptTemplate
  .bind(inputVariables, undefined, mediaInputs)
  .format("gemini_chat");

let start = new Date();

const camelParams = {};
for (const param in formattedPrompt.promptInfo.modelParameters) {
  camelParams[_.camelCase(param)] =
    formattedPrompt.promptInfo.modelParameters[param];
}

const generativeModel = genAI.getGenerativeModel({
  model: formattedPrompt.promptInfo.model,
  generationConfig: camelParams,
  systemInstruction: formattedPrompt.systemContent,
});

const result = await generativeModel.generateContent(
  formattedPrompt.llmPrompt[0].parts,
);
const returnContent = result.response.candidates[0].content.parts[0].text;
let end = new Date();

await freeplay.recordings.create({
  projectId,
  allMessages: [
    ...formattedPrompt.llmPrompt,
    {
      role: "model",
      parts: [{ text: returnContent }],
    },
  ],
  inputs: inputVariables,
  mediaInputs,
  sessionInfo: getSessionInfo(freeplay.sessions.create()),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: { isComplete: true },
});

console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", returnContent);
