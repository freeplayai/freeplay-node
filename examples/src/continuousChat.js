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

async function callLLM(input, history, sessionInfo) {
  // Prepare prompt with current conversation history
  const promptTemplate = await fpClient.prompts.get({
    projectId,
    templateName,
    environment,
  });
  const boundPrompt = promptTemplate.bind({ input }, history);
  const formattedPrompt = boundPrompt.format();

  const start = new Date();

  // Call OpenAI
  const response = await openai.chat.completions.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    ...formattedPrompt.promptInfo.modelParameters,
  });

  const end = new Date();

  // Extract response content
  const responseMessage = {
    role: "assistant",
    content: response.choices[0].message.content,
  };

  // Record the interaction
  await fpClient.recordings.create({
    projectId,
    allMessages: [...history, responseMessage],
    inputs: { input },
    sessionInfo: sessionInfo,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: true,
    },
  });

  return responseMessage;
}

async function main() {
  // Create a new session
  const session = fpClient.sessions.create({
    customMetadata: { conversation_topic: "home repair" },
  });
  const sessionInfo = getSessionInfo(session);

  // Initialize conversation history
  let history = [
    {
      role: "user",
      content: "Why isn't my sink working?",
    },
  ];

  // First interaction
  console.log("User: Why isn't my sink working?");
  const response1 = await callLLM("", history, sessionInfo);
  console.log(`Assistant: ${response1.content}\n`);

  // Update history with the assistant's response
  history.push(response1);

  // Second interaction - continue the conversation
  history.push({
    role: "user",
    content: "Tell me more about checking the P-trap",
  });

  console.log("User: Tell me more about checking the P-trap");
  const response2 = await callLLM("", history, sessionInfo);
  console.log(`Assistant: ${response2.content}\n`);

  // Update history again
  history.push(response2);

  // Third interaction
  history.push({
    role: "user",
    content: "What tools do I need for this job?",
  });

  console.log("User: What tools do I need for this job?");
  const response3 = await callLLM("", history, sessionInfo);
  console.log(`Assistant: ${response3.content}\n`);

  // Demonstrate session persistence - restore session
  console.log(
    "Simulating session restoration with session ID:",
    session.sessionId,
  );

  // In a real application, you would fetch messages from the backend
  // Here we're just using the history we've built up

  // New follow-up question in the restored session
  history.push(response3);
  history.push({
    role: "user",
    content: "How long should this repair take?",
  });

  console.log("User: How long should this repair take?");
  const response4 = await callLLM("", history, sessionInfo);
  console.log(`Assistant: ${response4.content}\n`);

  console.log("Session completed and recorded in Freeplay");
}

main().catch(console.error);
