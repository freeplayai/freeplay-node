import OpenAI from "openai";
import { z } from "zod";
import Freeplay, { getSessionInfo } from "../../dist/cjs/index";

// Structured output schemas using Zod
const COTStepSchema = z.object({
  thinking: z.string(),
  result: z.string(),
});

const COTResponseSchema = z.object({
  response: z.string(),
  steps: z.array(COTStepSchema),
});

async function main() {
  const fpClient = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"],
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const openaiClient = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const inputVariables = { question: "why is the sky blue?" };
  const projectId = process.env["FREEPLAY_PROJECT_ID"];

  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName: "my-chat-template",
    environment: "latest",
    variables: inputVariables,
  });

  console.log("Tool schema:", formattedPrompt.toolSchema);
  console.log("Output schema:", formattedPrompt.outputSchema);

  const start = new Date();

  // Build the completion parameters
  const completionParams: OpenAI.ChatCompletionCreateParams = {
    messages: (formattedPrompt.llmPrompt ||
      []) as OpenAI.ChatCompletionMessageParam[],
    model: formattedPrompt.promptInfo.model,
    ...formattedPrompt.promptInfo.modelParameters,
  };

  // Add tools if present
  if (formattedPrompt.toolSchema) {
    completionParams.tools = formattedPrompt.toolSchema;
  }

  // Use structured output if schema is available from prompt
  let completion: OpenAI.ChatCompletion;
  let jsonSchema: any = undefined;
  if (formattedPrompt.outputSchema) {
    completion = (await openaiClient.chat.completions.create({
      ...completionParams,
      response_format: {
        type: "json_schema",
        json_schema: {
          strict: true,
          schema: formattedPrompt.outputSchema,
          name: "COTReasoning",
        },
      },
    })) as OpenAI.ChatCompletion;
    console.log("Completion with prompt schema:", completion);
  } else {
    // Alternatively, you can use a Zod schema directly with Zod 4's native toJSONSchema()
    jsonSchema = z.toJSONSchema(COTResponseSchema);

    completion = (await openaiClient.chat.completions.create({
      ...completionParams,
      response_format: {
        type: "json_schema",
        json_schema: {
          strict: true,
          schema: jsonSchema,
          name: "COTReasoning",
        },
      },
    })) as OpenAI.ChatCompletion;
    console.log("Completion with Zod schema:", completion);
  }

  const end = new Date();

  // Record to Freeplay
  const session = fpClient.sessions.create();
  const messages = formattedPrompt.allMessages(completion.choices[0].message);

  await fpClient.recordings.create({
    projectId,
    allMessages: messages,
    sessionInfo: getSessionInfo(session),
    inputs: inputVariables,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: {
      provider: formattedPrompt.promptInfo.provider,
      model: formattedPrompt.promptInfo.model,
      startTime: start,
      endTime: end,
      modelParameters: formattedPrompt.promptInfo.modelParameters,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
          }
        : undefined,
    },
    toolSchema: formattedPrompt.toolSchema,
    outputSchema: formattedPrompt.outputSchema || jsonSchema,
    responseInfo: {
      isComplete: completion.choices[0].finish_reason === "stop",
    },
  });

  console.log("Recording created successfully");
}

main().catch(console.error);
