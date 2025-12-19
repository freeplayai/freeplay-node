import Freeplay, { getSessionInfo, getTestRunInfo } from "freeplay";

import OpenAI from "openai";

async function main() {
  const fpClient = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"],
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const openaiClient = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const projectId = process.env["FREEPLAY_PROJECT_ID"];
  const templatePrompt = await fpClient.prompts.get({
    projectId,
    templateName: "your-prompt",
    environment: "latest",
  });

  const testRun = await fpClient.testRuns.create({
    projectId,
    testList: "Name of your dataset",
    includeOutputs: true,
    name: "My Example Test Run",
    description: "Run from examples",
    flavorName: templatePrompt.promptInfo.flavorName,
  });

  for await (const testCase of testRun.testCases) {
    const formattedPrompt = templatePrompt
      .bind(testCase.variables, testCase.history)
      .format();

    const start = new Date();
    const completion = await openaiClient.chat.completions.create({
      // @ts-expect-error -- TODO: Fix types
      messages: formattedPrompt.llmPrompt,
      model: formattedPrompt.promptInfo.model,
      tools: formattedPrompt.toolSchema,
      ...formattedPrompt.promptInfo.modelParameters,
    });
    const end = new Date();

    const session = fpClient.sessions.create();
    const messages = formattedPrompt.allMessages(completion.choices[0].message);

    await fpClient.recordings.create({
      projectId,
      allMessages: messages,
      toolSchema: formattedPrompt.toolSchema,
      sessionInfo: getSessionInfo(session),
      inputs: testCase.variables,
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: {
        provider: formattedPrompt.promptInfo.provider,
        model: formattedPrompt.promptInfo.model,
        startTime: start,
        endTime: end,
        modelParameters: formattedPrompt.promptInfo.modelParameters,
      },
      responseInfo: {
        isComplete: completion.choices[0].finish_reason === "stop",
      },
      testRunInfo: getTestRunInfo(testRun, testCase.id),
      evalResults: {
        "f1-score": 0.48,
        is_non_empty: true,
      },
    });
  }
}

main().catch(console.error);
