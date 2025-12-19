import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "my-prompt-anthropic";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});
const anthropicClient = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

async function call(
  projectId,
  templateName,
  environment,
  input_variables,
  session_info,
  trace_info,
) {
  let formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName,
    environment,
    variables: input_variables,
  });

  let start = new Date();
  const llmResponse = await anthropicClient.messages.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    system: formattedPrompt.systemContent,
    ...formattedPrompt.promptInfo.modelParameters,
  });
  let end = new Date();

  const llmResponseText = llmResponse.content[0].text;

  let messages = formattedPrompt.allMessages({
    content: llmResponseText,
    role: "Assistant",
  });

  const completionResponse = await fpClient.recordings.create({
    projectId,
    allMessages: messages,
    inputs: input_variables,
    sessionInfo: session_info,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: "stop_sequence" === llmResponse.stop_reason,
    },
    traceInfo: trace_info,
  });

  return {
    completionId: completionResponse.completionId,
    llmResponseText: llmResponseText,
  };
}

const userQuestion = "answer life's most existential questions";

const session = await fpClient.sessions.create({
  customMetadata: { some_custom_metadata: 42 },
});
const traceInfo = await session.createTrace(userQuestion);
const botResponse = await call(
  projectId,
  templateName,
  environment,
  { question: userQuestion },
  getSessionInfo(session),
  traceInfo,
);

await traceInfo.recordOutput(projectId, botResponse.llmResponseText);
await fpClient.customerFeedback.updateTrace({
  projectId: projectId,
  traceId: traceInfo.traceId,
  customerFeedback: { freeplay_feedback: "positive", is_helpful: true },
});
console.log(
  `Trace recorded with Id ${traceInfo.traceId} and input "${traceInfo.input}" and output "${botResponse.llmResponseText}"`,
);
