import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import OpenAI from "openai";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const environment = "latest";
const templateName = "simple-chat";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

async function main() {
  const session = fpClient.sessions.create();
  const sessionInfo = getSessionInfo(session);

  const userQuestion =
    "What are the top 5 innovations in artificial intelligence in the last decade?";
  const history = [
    {
      role: "user",
      content: userQuestion,
    },
  ];

  // Get prompt
  const promptTemplate = await fpClient.prompts.get({
    projectId,
    templateName,
    environment,
  });
  const boundPrompt = promptTemplate.bind({}, history);
  const formattedPrompt = boundPrompt.format();

  const start = new Date();

  // Request streaming response
  console.log("Sending request, waiting for streaming response...\n");
  const stream = await openai.chat.completions.create({
    model: formattedPrompt.promptInfo.model,
    messages: formattedPrompt.llmPrompt,
    ...formattedPrompt.promptInfo.modelParameters,
    stream: true,
  });

  // Process the streamed response
  let fullContent = "";
  process.stdout.write("Response: ");

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
    fullContent += content;
  }
  console.log("\n");

  const end = new Date();

  // Create the final message
  const responseMessage = {
    role: "assistant",
    content: fullContent,
  };

  // Record the completed interaction
  await fpClient.recordings.create({
    projectId,
    allMessages: [...history, responseMessage],
    inputs: {},
    sessionInfo: sessionInfo,
    promptVersionInfo: formattedPrompt.promptInfo,
    callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
    responseInfo: {
      isComplete: true,
    },
  });

  console.log("\nInteraction recorded with Freeplay");
}

main().catch(console.error);
