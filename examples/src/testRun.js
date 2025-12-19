import { randomUUID } from "crypto";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  getTestRunInfo,
} from "freeplay";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "my-anthropic-prompt";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});
const anthropicClient = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

let session = await fpClient.sessions.create();

let templatePrompt = await fpClient.prompts.get({
  projectId,
  templateName,
  environment,
});

const testRun = await fpClient.testRuns.create({
  projectId,
  testList: "core-tests",
  name: `Test run: ${randomUUID()}`,
  description: "Test run from the Node SDK.",
});

for (const testCase of testRun.testCases) {
  const formattedPrompt = templatePrompt.bind(testCase.variables).format();

  let start = new Date();
  const anthropicResponse = await anthropicClient.messages.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    system: formattedPrompt.systemContent,
    ...formattedPrompt.promptInfo.modelParameters,
  });
  let end = new Date();

  let messages = formattedPrompt.allMessages({
    content: anthropicResponse.content[0].text,
    role: "assistant",
  });

  await fpClient.recordings.create({
    projectId,
    allMessages: messages,
    inputs: testCase.variables,
    sessionInfo: getSessionInfo(session),
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: "stop_sequence" === anthropicResponse.stop_reason,
    },
    testRunInfo: getTestRunInfo(testRun, testCase.id),
    evalResults: {
      bool_field: false,
      num_field: 0.23,
    },
  });

  console.log("Session: ", session);
  console.log("Prompt: '", formattedPrompt.llmPrompt, "'\n");
  console.log("Response: ", anthropicResponse);
}
