import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import OpenAI from "openai";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "album_bot";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});
const openaiClient = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

let session = await fpClient.sessions.create({
  customMetadata: { some_custom_metadata: 42 },
});

const functionDefinition = [
  {
    name: "get_album_tracklist",
    description: "Given an album name and genre, return a list of songs.",
    parameters: {
      type: "object",
      properties: {
        album_name: {
          type: "string",
          description: "Name of album from which to retrieve tracklist.",
        },
        genre: {
          type: "string",
          description: "Album genre",
        },
      },
    },
  },
];

let inputVariables = { pop_star: "Bruno Mars" };

let formattedPrompt = await fpClient.prompts.getFormatted({
  projectId,
  templateName,
  environment,
  variables: inputVariables,
});

let start = new Date();
const openaiResponse = await openaiClient.chat.completions.create({
  messages: formattedPrompt.messages,
  model: formattedPrompt.promptInfo.model,
  functions: functionDefinition,
});
let end = new Date();

let messages = formattedPrompt.allMessages({ role: "assistant", content: "" });

const completionResponse = await fpClient.recordings.create({
  projectId,
  allMessages: messages,
  inputs: inputVariables,
  sessionInfo: getSessionInfo(session),
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  responseInfo: {
    functionCallResponse: {
      name: "this is the func",
      arguments: '{"paramA": "valueA", "paramB": "valueB}',
    },
  },
});

await fpClient.customerFeedback.update({
  completionId: completionResponse.completionId,
  customerFeedback: { feedback: "it is just ok" },
});

console.log("Session: ", session);
console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
console.log("Response: ", openaiResponse);
