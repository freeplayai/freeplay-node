import Freeplay, {
  getCallInfo,
  getSessionInfo,
  SessionInfo,
  TraceInfo,
} from "freeplay";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const projectId: string | undefined = process.env["FREEPLAY_PROJECT_ID"];
const environment: string = "latest";
const templateName: string = "my-anthropic-prompt";

const freeplayApiUrl = "http://localhost:8080/api";
const freeplayApiKey = process.env["FREEPLAY_API_KEY"];

const fpClient = new Freeplay({
  freeplayApiKey,
  baseUrl: freeplayApiUrl,
});
const anthropicClient = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});
type CallResponse = {
  completionId: string;
  llmResponseText: string;
};

async function call(
  projectId: string | undefined,
  templateName: string,
  environment: string,
  input_variables: Record<string, any>,
  session_info: SessionInfo,
  trace_info: TraceInfo,
): Promise<CallResponse> {
  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName,
    environment,
    variables: input_variables,
  });

  const start = new Date();
  const llmResponse = await anthropicClient.messages.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt as MessageParam[],
    system: formattedPrompt.systemContent,
    ...formattedPrompt.promptInfo.modelParameters,
    max_tokens: 1,
  });
  const end = new Date();

  const llmResponseText =
    "text" in llmResponse.content[0] ? llmResponse.content[0].text : "";

  const messages = formattedPrompt.allMessages({
    content: llmResponseText,
    role: "assistant",
  });

  const completionResponse = await fpClient.recordings.create({
    projectId: projectId!,
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

const userQuestion: string = "answer life's most existential questions";

async function main() {
  if (!projectId) {
    throw new Error("FREEPLAY_PROJECT_ID environment variable is required");
  }

  const session = await fpClient.sessions.create({
    customMetadata: { some_custom_metadata: 42 },
  });
  const traceInfo = await session.createTrace({
    input: userQuestion,
    agentName: "my-trace",
    customMetadata: { some_custom_metadata: 42 },
  });
  const botResponse = await call(
    projectId,
    templateName,
    environment,
    { question: userQuestion },
    getSessionInfo(session),
    traceInfo,
  );

  await traceInfo.recordOutput(projectId, botResponse.llmResponseText, {
    eval_rating: 1,
    eval_success: true,
  });
  await fpClient.customerFeedback.updateTrace({
    projectId: projectId,
    traceId: traceInfo.traceId,
    customerFeedback: { freeplay_feedback: "positive", is_helpful: true },
  });
  console.log(
    `Trace recorded with Id ${traceInfo.traceId} and input "${traceInfo.input}" and output "${botResponse.llmResponseText}"`,
  );
}

main().catch(console.error);
