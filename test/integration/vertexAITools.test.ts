import { describeIntegrationTest as describe } from "../test_support";
import Freeplay, { getCallInfo, getSessionInfo } from "../../src";

describe("vertex_ai_tools_integration", () => {
  const projectId = process.env["EXAMPLES_PROJECT_ID"]!;
  const freeplay = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"]!,
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  test("vertex ai function calling", async () => {
    // Check if Vertex AI SDK is available
    let VertexAI: any;
    let HarmCategory: any;
    let HarmBlockThreshold: any;

    try {
      const vertexModule = await import("@google-cloud/vertexai");
      VertexAI = vertexModule.VertexAI;
      HarmCategory = vertexModule.HarmCategory;
      HarmBlockThreshold = vertexModule.HarmBlockThreshold;
    } catch {
      console.log("Vertex AI SDK not installed, skipping test");
      return;
    }

    const googleProjectId = process.env["EXAMPLES_VERTEX_PROJECT_ID"];
    if (!googleProjectId) {
      console.log("EXAMPLES_VERTEX_PROJECT_ID not set, skipping test");
      return;
    }

    const vertexAI = new VertexAI({
      project: googleProjectId,
      location: "us-central1",
    });

    const session = freeplay.sessions.create();
    const sessionInfo = getSessionInfo(session);
    const inputVariables = { location: "San Francisco" };

    // Expected tool schema on the prompt
    // [
    //   {
    //     name: "get_weather",
    //     description: "Get the current weather in a given location",
    //     parameters: {
    //       type: "object",
    //       properties: {
    //         location: {
    //           type: "string",
    //           description: "The city and state, e.g. San Francisco, CA",
    //         },
    //         unit: {
    //           type: "string",
    //           enum: ["celsius", "fahrenheit"],
    //           description: "The unit of temperature",
    //         },
    //       },
    //       required: ["location"],
    //     },
    //   },
    // ];

    // Get formatted prompt with tool schema
    const formattedPrompt = await freeplay.prompts.getFormatted({
      projectId,
      templateName: "test-prompt",
      environment: "latest",
      variables: inputVariables,
      flavorName: "gemini_chat",
    });

    // Override model to use a Gemini model
    formattedPrompt.promptInfo.model = "gemini-1.5-flash";

    // Get the generative model with tools
    const generativeModel = vertexAI.getGenerativeModel({
      model: formattedPrompt.promptInfo.model,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.1,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
      tools: formattedPrompt.toolSchema,
    });

    const start = new Date();

    try {
      // Start a chat session
      const chat = generativeModel.startChat({});

      // Send the message
      const result = await chat.sendMessage(
        "What's the weather like in San Francisco?",
      );

      const response = result.response;
      const end = new Date();

      // Check if the model wants to use a function
      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        console.log("Model requested function call:", functionCalls[0]);

        // Verify the function call is for get_weather
        expect(functionCalls[0].name).toBe("get_weather");
        expect(functionCalls[0].args).toHaveProperty("location");

        // Mock function response
        const functionResponse = {
          name: functionCalls[0].name,
          response: {
            temperature: 72,
            unit: "fahrenheit",
            description: "Sunny",
            location: functionCalls[0].args.location,
          },
        };

        // Send function response back to the model
        const result2 = await chat.sendMessage([
          {
            functionResponse,
          },
        ]);

        const finalResponse = result2.response;
        const finalContent = finalResponse.text();

        // Record the interaction
        await freeplay.recordings.create({
          projectId,
          allMessages: [
            {
              role: "user",
              content: "What's the weather like in San Francisco?",
            },
            { role: "assistant", content: finalContent },
          ],
          inputs: inputVariables,
          sessionInfo,
          promptVersionInfo: formattedPrompt.promptInfo,
          callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
          responseInfo: {
            isComplete: true,
            functionCallResponse: {
              function_name: functionCalls[0].name,
              arguments: JSON.stringify(functionCalls[0].args),
            },
          },
          toolSchema: formattedPrompt.toolSchema,
        });

        console.log("Function call test passed");
      } else {
        // If no function call, just record the response
        const content = response.text();

        await freeplay.recordings.create({
          projectId,
          allMessages: [
            {
              role: "user",
              content: "What's the weather like in San Francisco?",
            },
            { role: "assistant", content },
          ],
          inputs: inputVariables,
          sessionInfo,
          promptVersionInfo: formattedPrompt.promptInfo,
          callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
          responseInfo: { isComplete: true },
          toolSchema: formattedPrompt.toolSchema,
        });
      }
    } catch (error) {
      console.error("Error calling Vertex AI:", error);
      throw error;
    }
  });

  test("vertex ai multiple tools", async () => {
    const googleProjectId = process.env["EXAMPLES_VERTEX_PROJECT_ID"];
    if (!googleProjectId) {
      console.log("EXAMPLES_VERTEX_PROJECT_ID not set, skipping test");
      return;
    }

    // Expected tool schema on the prompt
    // [
    //   {
    //     name: "get_weather",
    //     description: "Get the current weather",
    //     parameters: {
    //       type: "object",
    //       properties: {
    //         location: { type: "string", description: "The location" },
    //       },
    //       required: ["location"],
    //     },
    //   },
    //   {
    //     name: "get_news",
    //     description: "Get the latest news",
    //     parameters: {
    //       type: "object",
    //       properties: {
    //         topic: { type: "string", description: "The news topic" },
    //         limit: { type: "integer", description: "Number of articles" },
    //       },
    //       required: ["topic"],
    //     },
    //   },
    // ];

    // Get formatted prompt with multiple tools
    const formattedPrompt = await freeplay.prompts.getFormatted({
      projectId,
      templateName: "test-prompt",
      environment: "latest",
      variables: { query: "test" },
      flavorName: "gemini_chat",
    });

    // Verify the tool_schema contains one Tool with multiple FunctionDeclarations
    expect(formattedPrompt.toolSchema).toBeDefined();
    expect(formattedPrompt.toolSchema).toHaveLength(1);
    expect(formattedPrompt.toolSchema![0]).toHaveProperty(
      "functionDeclarations",
    );
    expect(formattedPrompt.toolSchema![0].functionDeclarations).toHaveLength(2);

    const functionDeclarations =
      formattedPrompt.toolSchema![0].functionDeclarations;
    expect(functionDeclarations[0].name).toBe("get_weather");
    expect(functionDeclarations[1].name).toBe("get_news");

    console.log("Multiple tools test passed");
  });
});
