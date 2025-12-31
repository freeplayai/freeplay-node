import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import OpenAI from "openai";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "chat";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

// Define the tools we want the model to use
const tools = [
  {
    type: "function",
    function: {
      name: "get_current_weather",
      description: "Get the current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA",
          },
          format: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description:
              "The temperature unit to use. Infer this from the users location.",
          },
        },
        required: ["location", "format"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_n_day_weather_forecast",
      description: "Get an N-day weather forecast",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA",
          },
          format: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description:
              "The temperature unit to use. Infer this from the users location.",
          },
          days: {
            type: "integer",
            description: "The number of days to forecast",
          },
        },
        required: ["location", "format", "days"],
      },
    },
  },
];

// Mock function to handle the tool calls
function handleToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);

  console.log(`\nHandling tool call: ${name}`);
  console.log(`Arguments: ${JSON.stringify(parsedArgs, null, 2)}`);

  if (name === "get_current_weather") {
    // In a real app, this would call a weather API
    return {
      temperature: parsedArgs.format === "celsius" ? 22 : 72,
      unit: parsedArgs.format === "celsius" ? "C" : "F",
      description: "Sunny with scattered clouds",
      location: parsedArgs.location,
      humidity: 65,
      wind_speed: 10,
      wind_direction: "NW",
      precipitation: 0,
      timestamp: new Date().toISOString(),
    };
  } else if (name === "get_n_day_weather_forecast") {
    // Mock multi-day forecast
    const forecast = [];
    for (let i = 0; i < parsedArgs.days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      forecast.push({
        date: date.toISOString().split("T")[0],
        temperature:
          parsedArgs.format === "celsius"
            ? Math.round(20 + Math.random() * 5)
            : Math.round(68 + Math.random() * 9),
        unit: parsedArgs.format === "celsius" ? "C" : "F",
        description: ["Sunny", "Partly cloudy", "Cloudy", "Light rain"][
          Math.floor(Math.random() * 4)
        ],
        precipitation_chance: Math.round(Math.random() * 100),
        humidity: Math.round(60 + Math.random() * 30),
      });
    }

    return {
      location: parsedArgs.location,
      forecast: forecast,
    };
  }

  return { error: "Function not implemented" };
}

async function main() {
  const session = fpClient.sessions.create();
  const sessionInfo = getSessionInfo(session);

  // Start with the user question
  const userQuestion =
    "What will the weather be like in San Francisco for the next 3 days?";
  console.log(`User: ${userQuestion}`);

  const history = [
    {
      role: "user",
      content: userQuestion,
    },
  ];

  // Format the prompt
  const promptTemplate = await fpClient.prompts.get({
    projectId,
    templateName,
    environment,
  });
  const boundPrompt = promptTemplate.bind({}, history);
  const formattedPrompt = boundPrompt.format();

  const start = new Date();

  // Call OpenAI with tool definition
  const response = await openai.chat.completions.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    ...formattedPrompt.promptInfo.modelParameters,
    tools: tools,
  });

  const end = new Date();

  // Extract tool calls if any
  const assistantMessage = response.choices[0].message;
  console.log(
    "\nAssistant: I'll check the weather forecast for San Francisco for the next 3 days.",
  );

  // Record the interaction
  await fpClient.recordings.create({
    projectId,
    allMessages: [...history, assistantMessage],
    inputs: {},
    sessionInfo: sessionInfo,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: true,
      ...(assistantMessage.tool_calls && {
        functionCallResponse: {
          function_name: assistantMessage.tool_calls[0]?.function?.name || "",
          arguments: assistantMessage.tool_calls[0]?.function?.arguments || "",
        },
      }),
    },
    toolSchema: tools,
  });

  // Check if there are tool calls to handle
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCalls = assistantMessage.tool_calls;
    const toolResults = [];

    // Handle each tool call
    for (const toolCall of toolCalls) {
      const result = handleToolCall(toolCall);

      // Add the tool response to history
      toolResults.push({
        tool_call_id: toolCall.id,
        role: "tool",
        content: JSON.stringify(result),
      });
    }

    // Continue the conversation with the tool results
    const updatedHistory = [...history, assistantMessage, ...toolResults];

    // Call the model again with the tool responses
    const secondStart = new Date();
    const secondResponse = await openai.chat.completions.create({
      model: formattedPrompt.promptInfo.model,
      messages: updatedHistory,
      ...formattedPrompt.promptInfo.modelParameters,
    });
    const secondEnd = new Date();

    const finalMessage = secondResponse.choices[0].message;
    console.log(`\nAssistant: ${finalMessage.content}`);

    // Record the follow-up interaction
    await fpClient.recordings.create({
      projectId,
      allMessages: [...updatedHistory, finalMessage],
      inputs: {},
      sessionInfo: sessionInfo,
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: getCallInfo(formattedPrompt.promptInfo, secondStart, secondEnd),
      responseInfo: {
        isComplete: true,
      },
    });
  }
}

main().catch(console.error);
