import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  BedrockConverseAdapter,
} from "freeplay";

// Helper function to load image from URL
async function loadImageFromUrl(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const imageBytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";

  // Determine format from content-type or URL
  let imageFormat = "jpeg";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    imageFormat = "jpeg";
  } else if (contentType.includes("png")) {
    imageFormat = "png";
  } else if (contentType.includes("gif")) {
    imageFormat = "gif";
  } else if (contentType.includes("webp")) {
    imageFormat = "webp";
  } else {
    // Try to infer from URL
    const ext = imageUrl.toLowerCase().split(".").pop().split("?")[0];
    const formatMap = {
      jpg: "jpeg",
      jpeg: "jpeg",
      png: "png",
      gif: "gif",
      webp: "webp",
    };
    imageFormat = formatMap[ext] || "jpeg";
  }

  return { imageBytes, imageFormat, contentType: `image/${imageFormat}` };
}

// Initialize clients
const freeplay = new Freeplay({
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

// Image URL
const imageUrl =
  "https://images.pexels.com/photos/30614903/pexels-photo-30614903/free-photo-of-aerial-view-of-bilbao-city-and-guggenheim-museum.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1";

// Download the image
console.log(`Downloading image from: ${imageUrl}`);
const { imageBytes, imageFormat, contentType } =
  await loadImageFromUrl(imageUrl);
console.log(
  `Downloaded image (format: ${imageFormat}, size: ${imageBytes.byteLength} bytes)`,
);

// Question about the image
const question = "What do you see in this image? Describe it in detail.";
const promptVars = { question };

// Convert image to base64 for Freeplay media_inputs
const imageBase64 = Buffer.from(imageBytes).toString("base64");

const mediaInputs = {
  "city-image": {
    type: "base64",
    data: imageBase64,
    content_type: contentType,
  },
};

// Get formatted prompt from Freeplay
const promptTemplate = await freeplay.prompts.get({
  projectId,
  templateName: "nova_image_test",
  environment: "latest",
});

// Bind variables and media inputs
const boundPrompt = promptTemplate.bind(promptVars, undefined, mediaInputs);

// Apply BedrockConverseAdapter to convert messages to Bedrock format
const adapter = new BedrockConverseAdapter();
const convertedMessages = adapter.toLLMSyntax(boundPrompt.messages);

const formattedPrompt = {
  promptInfo: boundPrompt.promptInfo,
  llmPrompt: convertedMessages,
  systemContent: boundPrompt.messages.find((m) => m.role === "system")?.content,
};

// Construct messages for Bedrock API (with raw bytes)
const bedrockMessages = [
  {
    role: "user",
    content: [
      {
        image: {
          format: imageFormat,
          source: {
            bytes: new Uint8Array(imageBytes),
          },
        },
      },
      { text: question },
    ],
  },
];

const start = new Date();

// Create session
const session = freeplay.sessions.create();

// Call Bedrock API
const command = new ConverseCommand({
  modelId: formattedPrompt.promptInfo.model,
  messages: bedrockMessages,
  system: [{ text: formattedPrompt.systemContent || "" }],
  inferenceConfig: formattedPrompt.promptInfo.modelParameters,
});

const response = await converseClient.send(command);
const end = new Date();

const outputMessage = response.output.message;
const responseContent = outputMessage.content[0].text;

console.log(`\nUsing model: ${formattedPrompt.promptInfo.model}`);
console.log(`Template: ${formattedPrompt.promptInfo.templateName}`);
console.log("\n=== Model Response ===");
console.log(responseContent);

console.log("\n=== Recording to Freeplay ===");

// Record using plain Bedrock Converse message format
// Media will be handled by the backend via media_inputs
const recordMessages = [
  { role: "user", content: [{ text: question }] },
  outputMessage,
];

await freeplay.recordings.create({
  projectId,
  allMessages: recordMessages,
  sessionInfo: getSessionInfo(session),
  inputs: promptVars,
  promptVersionInfo: formattedPrompt.promptInfo,
  callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
  mediaInputs,
});

console.log("Successfully recorded to Freeplay");
