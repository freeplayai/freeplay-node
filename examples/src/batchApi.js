import fs_sync, { promises as fs } from "fs";
import Freeplay, { getCallInfo } from "freeplay";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

const freeplayClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const PROJECT_ID = "8f93dd00-2eb5-4ba2-9354-86d5c6831dfd";
const ENVIRONMENT = "latest";

const questions = [
  "What is the capital of France?",
  "Who is the president of the United States?",
  "What is the population of Tokyo?",
  "Who was the star of the movie 'The Matrix'?",
  "What is the capital of Japan?",
  "What is the highest mountain in the world?",
  "Who is the author of 'To Kill a Mockingbird'?",
];

const promptTemplate = await freeplayClient.prompts.get({
  projectId: PROJECT_ID,
  templateName: "basic_trivia_bot",
  environment: ENVIRONMENT,
});

// Create batch file data
const batchFileData = [];
for (const question of questions) {
  let startTime = new Date();
  const inputVars = { question };
  const formattedPrompt = promptTemplate.bind(inputVars).format();

  // Create session and completion in Freeplay
  const sessionId = await freeplayClient.sessions.create();
  const completionInfo = await freeplayClient.recordings.create({
    projectId: PROJECT_ID,
    allMessages: formattedPrompt.messages,
    inputs: inputVars,
    sessionInfo: sessionId,
    promptVersionInfo: promptTemplate.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, startTime, new Date()),
  });

  // Add to batch file data
  batchFileData.push({
    custom_id: completionInfo.completionId,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: promptTemplate.promptInfo.model,
      messages: formattedPrompt.messages,
      ...formattedPrompt.promptInfo.modelParameters,
    },
  });
}

await fs.writeFile(
  "batch_file.jsonl",
  batchFileData.map((line) => JSON.stringify(line)).join("\n"),
);

// Upload batch file
const batchFile = await openai.files.create({
  file: fs_sync.createReadStream("batch_file.jsonl"),
  purpose: "batch",
});
console.log("Batch file created:", batchFile);

// Create batch request
const batchRequest = await openai.batches.create({
  input_file_id: batchFile.id,
  endpoint: "/v1/chat/completions",
  completion_window: "24h",
});

let batch = batchRequest;
while (batch.status !== "completed") {
  await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 second delay
  batch = await openai.batches.retrieve(batch.id);
  console.log("Batch status:", batch.status);
}

const fileResponse = await openai.files.content(batch.output_file_id);
const results = await fileResponse.text();

// Process each line
const lines = results.trim().split("\n");
for (const line of lines) {
  const responseData = JSON.parse(line);
  const completionId = responseData.custom_id;
  const output = responseData.response.body.choices[0].message.content;

  console.log(completionId, output);

  // Update in Freeplay
  await freeplayClient.recordings.update({
    projectId: PROJECT_ID,
    completionId: completionId,
    newMessages: [
      {
        role: "assistant",
        content: output,
      },
    ],
    evalResults: { isBatchCompletion: true },
  });
}
