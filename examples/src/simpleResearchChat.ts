import type { Interface } from "readline";
import * as readline from "readline";
import Freeplay, {
  getCallInfo,
  getSessionInfo,
  Session,
  Trace,
} from "freeplay";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";

const projectId: string = process.env["FREEPLAY_PROJECT_ID"]!;
const environment: string = "latest";
const templateName: string = "research-agent";

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"]!,
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  answer: string;
  results?: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

interface ToolResult {
  answer?: string;
  results?: TavilySearchResult[];
  error?: string;
}

// Define the Tavily search tool
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "tavily_search",
      description:
        "Search the internet for current information using Tavily API. Use this when you need up-to-date information, facts, news, or any web content.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the internet",
          },
        },
        required: ["query"],
      },
    },
  },
];

// Function to call Tavily API
const searchTavily = async (query: string): Promise<TavilyResponse> => {
  console.log(`Searching: "${query}"`);
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env["TAVILY_API_KEY"],
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    }),
  });

  return response.json() as Promise<TavilyResponse>;
};

// Build full message array for API calls
function buildMessages(
  formattedPrompt: any,
  history: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  return [...formattedPrompt.llmPrompt, ...history.slice(1)];
}

// Handle tool calls
async function handleToolCall(
  toolCall: ChatCompletionMessageToolCall,
  trace: Trace,
  session: Session,
): Promise<ToolResult> {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args) as { query: string };

  const toolTrace = session.createTrace({
    kind: "tool",
    parentId: trace.traceId,
    name: toolCall.function.name,
    input: parsedArgs,
  });

  if (name !== "tavily_search") {
    return { error: "Function not implemented" };
  }

  const searchResults = await searchTavily(parsedArgs.query);
  console.log(`Search results: ${JSON.stringify(searchResults, null, 2)}`);

  const result = {
    answer: searchResults.answer,
    results: searchResults.results?.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    })),
  };
  await toolTrace.recordOutput(projectId, result);
  return result;
}

// Handle a single conversation turn
const handleTurn = async (
  userQuestion: string,
  history: ChatCompletionMessageParam[],
  session: Session,
  formattedPrompt: any,
  trace: Trace,
): Promise<string | null> => {
  history.push({ role: "user", content: userQuestion });
  while (true) {
    const start = new Date();
    const response = await openai.chat.completions.create({
      model: formattedPrompt.promptInfo.model,
      messages: buildMessages(formattedPrompt, history),
      ...formattedPrompt.promptInfo.modelParameters,
      tools,
    });
    const end = new Date();

    const assistantMessage = response.choices[0].message;

    await fpClient.recordings.create({
      projectId,
      parentId: trace.traceId,
      allMessages: [
        ...buildMessages(formattedPrompt, history),
        assistantMessage,
      ],
      inputs: {},
      sessionInfo: getSessionInfo(session),
      promptVersionInfo: formattedPrompt.promptInfo,
      callInfo: getCallInfo(formattedPrompt.promptInfo, start, end),
      toolSchema: tools,
      responseInfo: { isComplete: true },
    });

    history.push(assistantMessage as ChatCompletionMessageParam);
    if (!assistantMessage.tool_calls?.length) {
      return assistantMessage.content;
    }

    const toolResults: ChatCompletionMessageParam[] = await Promise.all(
      assistantMessage.tool_calls.map(
        async (toolCall) =>
          ({
            tool_call_id: toolCall.id,
            role: "tool",
            content: JSON.stringify(
              await handleToolCall(toolCall, trace, session),
            ),
          }) satisfies ChatCompletionToolMessageParam,
      ),
    );
    history.push(...toolResults);
  }
};

async function askQuestion(
  rl: Interface,
  history: ChatCompletionMessageParam[],
  session: Session,
  formattedPrompt: any,
): Promise<void> {
  while (true) {
    const userInput = await new Promise<string>((resolve) => {
      rl.question("User: ", resolve);
    });

    const input = userInput.trim();

    if (!input) continue;

    if (["exit", "quit"].includes(input.toLowerCase())) {
      console.log("\n👋 Goodbye!");
      rl.close();
      break;
    }

    const trace = session.createTrace(input);
    const response = await handleTurn(
      input,
      history,
      session,
      formattedPrompt,
      trace,
    );
    await trace.recordOutput(projectId, response || "");
    console.log(`\nAssistant: ${response}\n`);
  }
}

async function main(): Promise<void> {
  console.log("🤖 Research Agent - Ask me anything and I'll search the web!");
  console.log("Type 'exit' or 'quit' to end the conversation.\n");

  const session = fpClient.sessions.create();

  // Get the prompt template from Freeplay
  const promptTemplate = await fpClient.prompts.get({
    projectId,
    templateName,
    environment,
  });

  const boundPrompt = promptTemplate.bind({}, []);
  const formattedPrompt = boundPrompt.format();

  console.log(`Using model: ${formattedPrompt.promptInfo.model}\n`);

  // Initialize conversation history with system message
  const history: ChatCompletionMessageParam[] = [
    formattedPrompt.llmPrompt![0] as ChatCompletionMessageParam,
  ]; // System message

  // Create readline interface
  const rl: Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await askQuestion(rl, history, session, formattedPrompt);
}

main().catch(console.error);
