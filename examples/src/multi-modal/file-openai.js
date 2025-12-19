import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "media";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const freeplay = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: process.env["FREEPLAY_API_URL"] + "/api",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let inputVariables = {
  question: "What is the main topic of this PDF?",
};

let formattedPrompt = await freeplay.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables: inputVariables,
});

let start = new Date();

const pdfPath = path.join(__dirname, "example.pdf");
const pdfData = fs.readFileSync(pdfPath);
const pdfBase64 = `data:application/pdf;base64,${pdfData.toString("base64")}`;

const messages = [
  ...formattedPrompt.messages,
  {
    role: "user",
    content: [
      {
        type: "text",
        text: inputVariables.question,
      },
      {
        type: "file",
        file: {
          file_data: pdfBase64,
          filename: "example.pdf",
        },
      },
    ],
  },
];

const result = await openai.chat.completions.create({
  model: formattedPrompt.promptInfo.model,
  messages: messages,
  ...formattedPrompt.promptInfo.modelParameters,
});

const returnContent = result.choices[0].message.content;
let end = new Date();

await freeplay.recordings.create({
  projectId,
  allMessages: [
    ...messages,
    {
      role: "assistant",
      content: returnContent,
    },
  ],
  inputs: inputVariables,
  sessionInfo: getSessionInfo(freeplay.sessions.create()),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: { isComplete: true },
});

console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", returnContent);
