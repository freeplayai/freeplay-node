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
  question: "Could you explain why this image is funny?",
};

let formattedPrompt = await fpClient.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables: inputVariables,
});

let start = new Date();

const imageData = await fetch(
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Palace_of_Westminster_from_the_dome_on_Methodist_Central_Hall.jpg/2560px-Palace_of_Westminster_from_the_dome_on_Methodist_Central_Hall.jpg",
).then((response) => response.arrayBuffer());

const imageBase64 = Buffer.from(imageData).toString("base64");

const messages = [
  ...formattedPrompt.messages,
  {
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
          detail: "auto",
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
