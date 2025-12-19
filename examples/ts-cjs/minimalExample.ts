import Freeplay from "freeplay";

import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

async function main() {
  const fpClient = new Freeplay({
    freeplayApiKey: process.env["FREEPLAY_API_KEY"],
    baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
  });

  const openaiClient = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const projectId = process.env["FREEPLAY_PROJECT_ID"];

  const allMessages = [
    {
      role: "system",
      content:
        "You just say good job when someone tells their name. Like 'Good job, <name>!'",
    },
    {
      role: "user",
      content: "My name is John Doe.",
    },
  ];

  const completion = await openaiClient.chat.completions.create({
    messages: allMessages as ChatCompletionMessageParam[],
    model: "gpt-4o-mini",
  });

  await fpClient.recordings.create({
    projectId,
    allMessages: allMessages.concat(completion.choices[0].message),
  });
}

main().catch(console.error);
