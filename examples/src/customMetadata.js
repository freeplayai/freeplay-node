import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import Anthropic from "@anthropic-ai/sdk";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "chat";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

async function main() {
  // Initialize a session with custom metadata
  const session = fpClient.sessions.create({
    customMetadata: {
      user_id: "user_12345",
      subscription_tier: "premium",
      interface_type: "mobile_app",
      app_version: "2.1.0",
      location: "San Francisco",
      device: "iPhone 15",
      session_goal: "tech_support",
      initial_sentiment: "frustrated",
    },
  });

  // This metadata will be stored with the session and available for analytics later
  console.log("Created session with custom metadata:", session);

  const userQuestion = "My laptop keeps overheating. What should I do?";
  const history = [
    {
      role: "user",
      content: userQuestion,
    },
  ];

  // Format the prompt for Anthropic
  const formattedPrompt = await fpClient.prompts.getFormatted({
    projectId,
    templateName,
    environment,
    variables: {},
    history,
  });

  console.log("Sending request to Anthropic...");
  const start = new Date();

  // Call Anthropic
  const response = await anthropic.messages.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    system: formattedPrompt.systemContent,
    ...formattedPrompt.promptInfo.modelParameters,
  });

  const end = new Date();

  // Process the Anthropic response
  console.log("\nResponse from Anthropic:");
  const assistantMessage = {
    role: "assistant",
    content: response.content,
  };

  console.log(assistantMessage.content[0].text);

  // Record the interaction with all the custom metadata
  const recordingResponse = await fpClient.recordings.create({
    projectId,
    allMessages: [...history, assistantMessage],
    inputs: {},
    sessionInfo: getSessionInfo(session),
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: true,
    },
  });

  console.log(
    "\nInteraction recorded with ID:",
    recordingResponse.completionId,
  );

  // Now add customer feedback to the recorded completion
  await fpClient.customerFeedback.update({
    completionId: recordingResponse.completionId,
    customerFeedback: {
      helpful: true,
      solved_issue: 4, // Scale of 1-5
      response_quality: "excellent",
      user_sentiment: "satisfied",
      time_to_resolution: 120, // seconds
    },
  });

  console.log("\nAdded custom feedback to completion");
}

main().catch(console.error);
