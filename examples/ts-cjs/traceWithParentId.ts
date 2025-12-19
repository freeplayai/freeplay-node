import Freeplay, { CallInfo, ResponseInfo, SessionInfo } from "freeplay";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const fpclient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"]!,
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});
const projectId = process.env["FREEPLAY_PROJECT_ID"]!;

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

async function callAndRecord(
  projectId: string,
  templateName: string,
  env: string,
  inputVariables: Record<string, any>,
  sessionInfo: SessionInfo,
  parentId?: string,
): Promise<{ completionId: string; llmResponse: string }> {
  const formattedPrompt = await fpclient.prompts.getFormatted({
    projectId,
    templateName,
    environment: env,
    variables: inputVariables,
  });

  console.log(`Ready for LLM: ${JSON.stringify(formattedPrompt.llmPrompt)}`);

  const start = new Date();
  const completion = await client.messages.create({
    system: formattedPrompt.systemContent,
    messages: formattedPrompt.llmPrompt as MessageParam[],
    model: formattedPrompt.promptInfo.model,
    max_tokens: 1024,
    ...formattedPrompt.promptInfo.modelParameters,
  });
  const end = new Date();

  const llmResponse =
    "text" in completion.content[0] ? completion.content[0].text : "";
  console.log("Completion: %s", llmResponse);

  const allMessages = formattedPrompt.allMessages({
    role: "assistant",
    content: llmResponse,
  });

  const callInfo: CallInfo = {
    provider: formattedPrompt.promptInfo.provider,
    model: formattedPrompt.promptInfo.model,
    startTime: start,
    endTime: end,
    modelParameters: formattedPrompt.promptInfo.modelParameters,
    providerInfo: formattedPrompt.promptInfo.providerInfo,
  };

  const responseInfo: ResponseInfo = {
    isComplete: completion.stop_reason === "stop_sequence",
  };

  const recordResponse = await fpclient.recordings.create({
    projectId: projectId,
    allMessages: allMessages,
    sessionInfo: sessionInfo,
    inputs: inputVariables,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: callInfo,
    responseInfo: responseInfo,
    parentId: parentId,
  });

  return {
    completionId: recordResponse.completionId,
    llmResponse: llmResponse,
  };
}

// Send 3 questions to the model encapsulated into a trace
const userQuestions = [
  "answer life's most existential questions",
  "what is sand?",
  "how tall are lions?",
];

async function main() {
  const session = fpclient.sessions.create({
    customMetadata: { metadata_123: "blah" },
  });
  let lastTraceId: string | undefined = undefined;

  for (const question of userQuestions) {
    const traceInfo = session.createTrace({
      input: question,
      agentName: "mr-secret-agent",
      customMetadata: { metadata_key: "hello" },
      parentId: lastTraceId,
    });

    const botResponse = await callAndRecord(
      projectId,
      "my-anthropic-prompt",
      "latest",
      { question: question },
      { sessionId: session.sessionId, customMetadata: session.customMetadata },
      lastTraceId ? lastTraceId : traceInfo.traceId,
    );

    const categorizationResult = await callAndRecord(
      projectId,
      "question-classifier",
      "latest",
      { question: question },
      { sessionId: session.sessionId, customMetadata: session.customMetadata },
      botResponse.completionId,
    );

    console.log(
      `Sending customer feedback for completion id: ${botResponse.completionId}`,
    );
    await fpclient.customerFeedback.update({
      projectId: projectId,
      completionId: botResponse.completionId,
      customerFeedback: {
        is_it_good: Math.random() > 0.5 ? "nah" : "yuh",
        topic: categorizationResult.llmResponse,
      },
    });

    await traceInfo.recordOutput(projectId, botResponse.llmResponse, {
      bool_field: false,
      num_field: 0.9,
    });

    // Record feedback for the trace
    const traceFeedback = {
      is_it_good: Math.random() > 0.5,
      freeplay_feedback: Math.random() > 0.5 ? "positive" : "negative",
    };
    await fpclient.customerFeedback.updateTrace({
      projectId: projectId,
      traceId: traceInfo.traceId,
      customerFeedback: traceFeedback,
    });
    console.log(`Trace info id: ${traceInfo.traceId}`);
    lastTraceId = traceInfo.traceId;
  }
}

main().catch(console.error);
