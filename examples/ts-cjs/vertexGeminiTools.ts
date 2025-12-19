import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import { VertexAI } from "@google-cloud/vertexai";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "my-openai-prompt";
const googleProjectId =
  process.env["EXAMPLES_VERTEX_PROJECT_ID"] ?? "fp-d-int-069c";

async function main() {
  const fpClient = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"],
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const inputVariables = {
    location: "San Francisco",
  };

  // Get formatted prompt with tool schemas
  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName,
    environment,
    variables: inputVariables,
    flavorName: "gemini_chat",
    history: [],
  });

  // Initialize Vertex AI
  const vertexAI = new VertexAI({
    project: googleProjectId,
    location: "us-central1",
  });

  // Create a generative model with tools
  const generativeModel = vertexAI.getGenerativeModel({
    model: formattedPrompt.promptInfo.model,
    generationConfig: formattedPrompt.promptInfo.modelParameters,
    systemInstruction: formattedPrompt.systemContent,
    tools: formattedPrompt.toolSchema,
  });

  // Create a session for tracking
  const session = await fpClient.sessions.create();
  const start = new Date();

  // Start a chat session
  const chat = generativeModel.startChat({});

  // Send the message
  const result = await chat.sendMessage(
    formattedPrompt.llmPrompt?.[0]?.parts?.[0]?.text,
  );
  const response = result.response;

  // Check if the model wants to use a function
  const candidate = response.candidates?.[0];
  const functionCall = candidate?.content.parts.find(
    (part: any) => part.functionCall,
  );

  if (functionCall) {
    console.log("Model requested function call:", functionCall.functionCall);

    // Mock function response (in a real app, you would call the actual function)
    const functionResponse = {
      name: functionCall.functionCall.name,
      response: {
        output: `{ "temperature": 72, "unit": "fahrenheit", "description": "Sunny with scattered clouds"}`,
      },
    };

    console.log("functionResponse", functionResponse);

    // Send function response back to the model
    const result2 = await chat.sendMessage([
      {
        functionResponse,
      },
    ]);

    const finalResponse = result2.response;
    const finalCandidate = finalResponse.candidates?.[0];
    const finalContent = finalCandidate?.content.parts[0]?.text || "";

    const end = new Date();

    // From Python example
    // # Build complete message history for recording
    // all_messages = list(formatted_prompt.llm_prompt)  # Start with initial messages
    // all_messages.append(content)
    // all_messages.append({'role': 'user', 'parts': [function_response_part]})
    // all_messages.append(function_response.candidates[0].content)

    const messages = [
      ...formattedPrompt.llmPrompt,
      response.candidates?.[0]?.content,
      { role: "user", parts: [{ functionResponse }] },
      finalResponse.candidates?.[0]?.content,
    ];

    console.log("messages", JSON.stringify(messages, null, 2));

    await fpClient.recordings.create({
      projectId,
      allMessages: messages,
      inputs: inputVariables,
      sessionInfo: getSessionInfo(session),
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
      toolSchema: formattedPrompt.toolSchema,
    });

    console.log("Function Call:", functionCall.functionCall.name);
    console.log("Arguments:", functionCall.functionCall.args);
    console.log("Final Response:", finalContent);
  } else {
    // No function call, just a regular response
    const content = candidate?.content.parts[0]?.text || "";
    const end = new Date();

    const messages = formattedPrompt.allMessages({
      role: "assistant",
      content,
    });

    console.log("toolSchema", formattedPrompt.toolSchema);

    await fpClient.recordings.create({
      projectId,
      allMessages: messages,
      inputs: inputVariables,
      sessionInfo: getSessionInfo(session),
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
      responseInfo: { isComplete: true },
      toolSchema: formattedPrompt.toolSchema,
    });

    console.log("Response:", content);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
