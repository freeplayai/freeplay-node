import { GoogleGenerativeAI } from "@google/generative-ai";
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import _ from "lodash";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "media";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: process.env["FREEPLAY_API_URL"] + "/api",
});

let inputVariables = {
  question: "Could you explain why this image is funny?",
};

let formattedPrompt = await fpClient.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables: inputVariables,
});

let start = new Date();

const camelParams = {};
for (const param in formattedPrompt.promptInfo.modelParameters) {
  camelParams[_.camelCase(param)] =
    formattedPrompt.promptInfo.modelParameters[param];
}

const imageData = await fetch(
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Palace_of_Westminster_from_the_dome_on_Methodist_Central_Hall.jpg/2560px-Palace_of_Westminster_from_the_dome_on_Methodist_Central_Hall.jpg",
).then((response) => response.arrayBuffer());

const generativeModel = genAI.getGenerativeModel({
  model: formattedPrompt.promptInfo.model,
  generationConfig: camelParams,
  systemInstruction: formattedPrompt.systemContent,
});

const prompt = [
  formattedPrompt.llmPrompt[0].parts[0],
  {
    inlineData: {
      data: Buffer.from(imageData).toString("base64"),
      mimeType: "image/jpeg",
    },
  },
];

const result = await generativeModel.generateContent(prompt);
const returnContent = result.response.candidates[0].content.parts[0].text;
let end = new Date();

await fpClient.recordings.create({
  projectId,
  allMessages: [
    {
      role: "user",
      parts: prompt,
    },
    {
      role: "model",
      parts: [{ text: returnContent }],
    },
  ],
  inputs: inputVariables,
  sessionInfo: getSessionInfo(fpClient.sessions.create()),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: { isComplete: true },
});

console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", returnContent);
