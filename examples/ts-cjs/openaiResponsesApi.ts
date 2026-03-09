import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import OpenAI from "openai";

async function main() {
  const fpClient = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"],
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const openaiClient = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const inputVariables = { location: "San Francisco" };
  const projectId = process.env["FREEPLAY_PROJECT_ID"]!;

  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName: "my-openai-prompt",
    environment: "latest",
    variables: inputVariables,
  });

  console.log("Instructions (system):", formattedPrompt.systemContent);
  console.log("Input messages:", formattedPrompt.llmPrompt);
  console.log("Tool schema:", formattedPrompt.toolSchema);
  console.log("Output schema:", formattedPrompt.outputSchema);

  // Build the Responses API call parameters
  const responseParams: Record<string, any> = {
    ...formattedPrompt.promptInfo.modelParameters,
  };
  if (formattedPrompt.systemContent) {
    responseParams.instructions = formattedPrompt.systemContent;
  }
  if (formattedPrompt.toolSchema) {
    responseParams.tools = formattedPrompt.toolSchema;
  }
  if (formattedPrompt.outputSchema) {
    responseParams.text = {
      format: {
        type: "json_schema",
        strict: true,
        schema: formattedPrompt.outputSchema,
        name: "COTReasoning",
      },
    };
  }

  const start = new Date();
  const completion = await openaiClient.responses.create({
    input: formattedPrompt.llmPrompt as OpenAI.Responses.ResponseInput,
    model: formattedPrompt.promptInfo.model,
    ...responseParams,
  });
  const end = new Date();

  console.log("Completion:", completion);

  // Record to Freeplay
  const messages = formattedPrompt.allMessages(completion.output);

  await fpClient.recordings.create({
    projectId,
    allMessages: messages,
    inputs: inputVariables,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end, {
      promptTokens: completion.usage.input_tokens,
      completionTokens: completion.usage.output_tokens,
    }),
    toolSchema: formattedPrompt.toolSchema,
  });

  console.log("Recording created successfully");
}

main().catch(console.error);
