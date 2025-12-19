import { randomUUID } from "crypto";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  getTestRunInfo,
} from "freeplay";
import OpenAI from "openai";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "media-prompt"; // Assuming a template that supports media

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const openaiClient = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

console.log("=== Configuration ===");
console.log(`FREEPLAY_API_URL: ${process.env["FREEPLAY_API_URL"]}`);
console.log(`Base URL: ${process.env["FREEPLAY_API_URL"]}/api`);
console.log(`Project ID: ${projectId}`);

console.log("\nCreating test run with media inputs...");

// Create a test run using the "media-1" test list (as mentioned by the user)
console.log(
  `API Endpoint: ${process.env["FREEPLAY_API_URL"]}/api/v2/projects/${projectId}/test-runs`,
);
const testRun = await fpClient.testRuns.create({
  projectId,
  testList: "media-1",
  name: `Media Test Run: ${randomUUID()}`,
  description: "Test run with media inputs from the Node SDK.",
  flavorName: "openai_chat",
});

console.log(`Created test run with ID: ${testRun.testRunId}`);
console.log(`Found ${testRun.testCases.length} test cases`);

// Process each test case
for (const testCase of testRun.testCases) {
  // Get the prompt template
  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName,
    environment,
    variables: testCase.variables,
    media: testCase.mediaVariables,
    flavorName: "openai_chat",
  });

  console.log(`Calling OpenAI with media inputs...`);

  const start = new Date();
  const openaiResponse = await openaiClient.chat.completions.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    ...formattedPrompt.promptInfo.modelParameters,
  });
  const end = new Date();

  const responseContent = openaiResponse.choices[0].message.content;
  console.log(`Response: ${responseContent?.substring(0, 100)}...`);

  // Create session and record the interaction
  const session = fpClient.sessions.create();
  await fpClient.recordings.create({
    projectId,
    allMessages: [
      ...(formattedPrompt.llmPrompt || []),
      {
        role: "assistant",
        content: responseContent,
      },
    ],
    inputs: testCase.variables,
    mediaInputs: testCase.mediaVariables,
    sessionInfo: getSessionInfo(session),
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: openaiResponse.choices[0].finish_reason === "stop",
    },
    testRunInfo: getTestRunInfo(testRun, testCase.id),
    evalResults: {
      has_media: true,
      media_count: Object.keys(testCase.mediaVariables).length,
      response_length: responseContent?.length || 0,
    },
  });
}

console.log("\nTest run completed successfully!");
