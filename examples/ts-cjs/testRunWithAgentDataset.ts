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
    templateName: "good-job",
    environment: "latest",
  });

  const testRun = await fpClient.testRuns.create({
    projectId,
    // Agentic dataset
    testList: "names",
    includeOutputs: true,
    name: "Apprecianator",
    description: "Every name deserves appreciation",
    flavorName: templatePrompt.promptInfo.flavorName,
  });

  for await (const testCase of testRun.tracesTestCases) {
    console.log(`Processing test case ${JSON.stringify(testCase)}`);
    const formattedPrompt = templatePrompt
      .bind({ name: testCase.input })
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
    const traceInfo = session.createTrace({
      input: testCase.input,
      agentName: "appreciator-agent",
      customMetadata: { some_custom_metadata: 42 },
    });
    const messages = formattedPrompt.allMessages(completion.choices[0].message);

    await fpClient.recordings.create({
      projectId,
      allMessages: messages,
      toolSchema: formattedPrompt.toolSchema,
      sessionInfo: getSessionInfo(session),
      inputs: { name: testCase.input },
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

    await traceInfo.recordOutput(
      projectId,
      completion.choices[0].message.content,
      {
        "f1-score": 0.48,
        is_non_empty: true,
      },
      getTestRunInfo(testRun, testCase.id),
    );
  }
}

main().catch(console.error);
