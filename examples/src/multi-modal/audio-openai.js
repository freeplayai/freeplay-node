import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import OpenAI from "openai";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "media";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: process.env["FREEPLAY_API_URL"] + "/api",
});

let inputVariables = {
  question: "What is in this recording?",
};

let formattedPrompt = await fpClient.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables: inputVariables,
});

let start = new Date();

const audioData = await fetch(
  "https://cdn.openai.com/API/docs/audio/alloy.wav",
).then((response) => response.arrayBuffer());

const audioBase64 = Buffer.from(audioData).toString("base64");

const messages = [
  ...formattedPrompt.messages,
  {
    role: "user",
    content: [
      { type: "text", text: inputVariables.question },
      {
        type: "input_audio",
        input_audio: { data: audioBase64, format: "wav" },
      },
    ],
  },
];

const result = await openai.chat.completions.create({
  model: "gpt-4o-audio-preview",
  messages: messages,
  ...formattedPrompt.promptInfo.modelParameters,
});

const returnContent = result.choices[0].message.content;
let end = new Date();

await fpClient.recordings.create({
  projectId,
  allMessages: [
    ...messages,
    {
      role: "assistant",
      content: returnContent,
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
