import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  BedrockConverseAdapter,
} from "freeplay";

// Tool functions
function addNumbers(numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}

function multipleNumbers(numbers) {
  return numbers.reduce((a, b) => a * b, 1);
}

function subtractTwoNumbers(a, b) {
  return a - b;
}

function divideTwoNumbers(a, b) {
  return a / b;
}

function executeFunction(funcName, args) {
  switch (funcName) {
    case "add_numbers":
      return addNumbers(args.numbers);
    case "multiple_numbers":
      return multipleNumbers(args.numbers);
    case "subtract_two_numbers":
      return subtractTwoNumbers(args.a, args.b);
    case "divide_two_numbers":
      return divideTwoNumbers(args.a, args.b);
    default:
      throw new Error(`Function not found: ${funcName}`);
  }
}

// Tool specifications
const toolsSpec = [
  {
    toolSpec: {
      name: "add_numbers",
      description: "Add a list of numbers",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            numbers: {
              type: "array",
              items: { type: "integer" },
              description: "List of numbers to add",
            },
          },
          required: ["numbers"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "multiple_numbers",
      description: "Multiply a list of numbers",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            numbers: {
              type: "array",
              items: { type: "integer" },
              description: "List of numbers to multiply",
            },
          },
          required: ["numbers"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "subtract_two_numbers",
      description: "Subtract two numbers",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            a: { type: "integer", description: "First number" },
            b: { type: "integer", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "divide_two_numbers",
      description: "Divide two numbers",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            a: { type: "integer", description: "First number" },
            b: { type: "integer", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
    },
  },
];

// Initialize clients
const fpClient = new Freeplay({
  freeplayApiKey: process.env.FREEPLAY_API_KEY,
  baseUrl: `${process.env.FREEPLAY_API_URL}/api`,
});

const converseClient = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const projectId = process.env.FREEPLAY_PROJECT_ID;
const equation = "2x + 5 = 10";
const promptVars = { equation };

// Get formatted prompt
const promptTemplate = await fpClient.prompts.get({
  projectId,
  templateName: "nova_tool_call",
  environment: "latest",
});

// Bind variables and provide empty history if template expects it
const boundPrompt = promptTemplate.bind(promptVars, []);

// Apply BedrockConverseAdapter to convert messages to Bedrock format
const adapter = new BedrockConverseAdapter();
const convertedMessages = adapter.toLLMSyntax(boundPrompt.messages);

const formattedPrompt = {
  promptInfo: boundPrompt.promptInfo,
  llmPrompt: convertedMessages,
  systemContent: boundPrompt.messages.find((m) => m.role === "system")?.content,
};

console.log(`Using model: ${formattedPrompt.promptInfo.model}`);
console.log(`Template: ${formattedPrompt.promptInfo.templateName}`);

// Create session and trace
const session = fpClient.sessions.create();
const trace = session.createTrace(equation);

// Initialize history with formatted prompt messages
const history = [...formattedPrompt.llmPrompt];

let finishReason = null;
while (finishReason !== "end_turn" && finishReason !== "stop") {
  const start = new Date();

  // Make Bedrock Converse call
  const command = new ConverseCommand({
    modelId: formattedPrompt.promptInfo.model,
    messages: history,
    system: [{ text: formattedPrompt.systemContent || "" }],
    inferenceConfig: formattedPrompt.promptInfo.modelParameters,
    toolConfig: { tools: toolsSpec },
  });

  const response = await converseClient.send(command);
  const end = new Date();

  console.log(`\nResponse: ${JSON.stringify(response, null, 2)}`);

  const outputMessage = response.output.message;
  finishReason = response.stopReason;

  console.log(`Stop reason: ${finishReason}`);

  if (finishReason === "tool_use") {
    // Find the toolUse in content (may not be first item due to thinking text)
    let toolUse = null;
    for (const contentItem of outputMessage.content) {
      if (contentItem.toolUse) {
        toolUse = contentItem.toolUse;
        break;
      }
    }

    if (!toolUse) {
      throw new Error("No toolUse found in response");
    }

    const toolName = toolUse.name;
    const toolInput = toolUse.input;
    const toolId = toolUse.toolUseId;

    console.log(
      `\nExecuting function ${toolName} with args ${JSON.stringify(toolInput, null, 2)}`,
    );
    const result = executeFunction(toolName, toolInput);
    console.log(`Result: ${result}\n`);

    // Add the full assistant response to history
    console.log("=== Adding assistant message to history ===");
    console.log(`Assistant message: ${JSON.stringify(outputMessage, null, 2)}`);
    history.push(outputMessage);

    // Add the tool response to history
    const toolResultMessage = {
      role: "user",
      content: [
        {
          toolResult: {
            toolUseId: toolId,
            content: [{ text: String(result) }],
          },
        },
      ],
    };
    console.log("\n=== Adding tool result to history ===");
    console.log(
      `Tool result message: ${JSON.stringify(toolResultMessage, null, 2)}`,
    );
    history.push(toolResultMessage);

    // Record the tool call to Freeplay
    console.log("\n=== Recording to Freeplay ===");
    console.log(`History length: ${history.length}`);

    await fpClient.recordings.create({
      projectId,
      allMessages: history,
      inputs: promptVars,
      sessionInfo: getSessionInfo(session),
      traceInfo: trace,
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    });

    console.log("\n✓ Successfully recorded to Freeplay");
  } else {
    // Final response
    const content = outputMessage.content[0].text;
    console.log("=== Solution ===");
    console.log(content);
    console.log("\n");

    // Add the final response to history
    console.log("=== Adding final response to history ===");
    console.log(`Final message: ${JSON.stringify(outputMessage, null, 2)}`);
    history.push(outputMessage);

    // Record the final response to Freeplay
    console.log("\n=== Recording final response to Freeplay ===");
    console.log(`History length: ${history.length}`);

    await fpClient.recordings.create({
      projectId,
      allMessages: history,
      inputs: promptVars,
      sessionInfo: getSessionInfo(session),
      traceInfo: trace,
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    });

    console.log("\n✓ Successfully recorded to Freeplay");

    trace.recordOutput(projectId, content);
  }
}
