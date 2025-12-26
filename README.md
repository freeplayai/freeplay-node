<h1 align="center">Freeplay Node.js SDK</h1>

<p align="center">
  <strong>The official Node.js/TypeScript SDK for the <a href="https://freeplay.ai">Freeplay</a> platform</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freeplay"><img src="https://img.shields.io/npm/v/freeplay.svg" alt="npm version" /></a>
  <a href="https://github.com/freeplayai/freeplay-node/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License" /></a>
</p>

<p align="center">
  <a href="https://docs.freeplay.ai">Documentation</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

Freeplay helps teams build, test, and optimize LLM-powered applications. This SDK enables you to:

- **Manage prompts** — Version and retrieve prompt templates across environments
- **Record interactions** — Log LLM calls for observability and debugging
- **Track sessions** — Group related interactions together
- **Run evaluations** — Execute test runs against your prompts
- **Capture feedback** — Collect customer feedback on responses
- **Trace agents** — Monitor multi-step agent workflows

## Installation

```bash
npm install freeplay
```

## Quick Start

```typescript
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
import OpenAI from "openai";

// Initialize clients
const freeplay = new Freeplay({
  freeplayApiKey: process.env.FREEPLAY_API_KEY,
  baseUrl: `https://${process.env.FREEPLAY_CUSTOMER}.freeplay.ai/api`,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create a session for grouping interactions
const session = freeplay.sessions.create();

// Get your prompt from Freeplay
const prompt = await freeplay.prompts.getFormatted({
  projectId: process.env.FREEPLAY_PROJECT_ID,
  templateName: "my-prompt",
  environment: "prod",
  variables: { user_input: "Hello, world!" },
});

// Call your LLM provider
const start = new Date();
const response = await openai.chat.completions.create({
  model: prompt.promptInfo.model,
  messages: prompt.llmPrompt,
  ...prompt.promptInfo.modelParameters,
});
const end = new Date();

// Record the interaction
await freeplay.recordings.create({
  projectId: process.env.FREEPLAY_PROJECT_ID,
  allMessages: prompt.allMessages({
    role: "assistant",
    content: response.choices[0].message.content,
  }),
  inputs: { user_input: "Hello, world!" },
  sessionInfo: getSessionInfo(session),
  promptVersionInfo: prompt.promptInfo,
  callInfo: getCallInfo(prompt.promptInfo, start, end),
  responseInfo: { isComplete: true },
});
```

### Updating Metadata

Update session and trace metadata after creation. This is useful for associating IDs and metadata generated after a conversation ends (e.g., ticket IDs, summary IDs, resolution status).

#### Update Session Metadata

```typescript
await fpclient.metadata.updateSession({
  projectId: "550e8400-e29b-41d4-a716-446655440000",
  sessionId: "660e8400-e29b-41d4-a716-446655440000",
  metadata: {
    customer_id: "cust_123",
    conversation_rating: 5,
    support_tier: "premium",
  },
});
```

#### Update Trace Metadata

```typescript
await fpclient.metadata.updateTrace({
  projectId: "550e8400-e29b-41d4-a716-446655440000",
  sessionId: "660e8400-e29b-41d4-a716-446655440000",
  traceId: "770e8400-e29b-41d4-a716-446655440000",
  metadata: {
    resolution_category: "billing_credit_applied",
    ticket_id: "TICKET-12345678",
    resolved: true,
    resolution_time_ms: 1234,
  },
});
```

**Merge Semantics**: New keys overwrite existing keys, preserving unmentioned keys.

### Tool Schemas

The SDK supports multiple tool schema formats for different LLM providers:

#### GenAI/Vertex AI Format

GenAI uses a unique structure where a single tool contains multiple function declarations:

```typescript
import { GenaiFunction, GenaiTool } from "freeplay";

const weatherFunction: GenaiFunction = {
  name: "get_weather",
  description: "Get the current weather for a location",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name" },
      units: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
      },
    },
    required: ["location"],
  },
};

// Single tool with multiple functions (GenAI-specific)
const toolSchema: GenaiTool[] = [
  {
    functionDeclarations: [weatherFunction, newsFunction, searchFunction],
  },
];

await freeplay.recordings.create({
  projectId,
  allMessages: [...],
  toolSchema,
  callInfo: { provider: "genai", model: "gemini-2.0-flash" },
});
```

#### OpenAI Format

```typescript
const toolSchema = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather information",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
        },
        required: ["location"],
      },
    },
  },
];
```

#### Anthropic Format

```typescript
const toolSchema = [
  {
    name: "get_weather",
    description: "Get weather information",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    },
  },
];
```

**Note**: All formats are backward compatible. The backend automatically normalizes tool schemas regardless of format.

See the [Freeplay Docs](https://docs.freeplay.ai) for more usage examples and the API reference.

## Documentation
For comprehensive documentation and examples, visit **[docs.freeplay.ai](https://docs.freeplay.ai)**.

## Requirements

- Node.js 18 or higher
- A [Freeplay](https://freeplay.ai) account and API key

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- **Bug reports** — [Open an issue](https://github.com/freeplayai/freeplay-node/issues)
- **Security issues** — Email [security@freeplay.ai](mailto:security@freeplay.ai)

## Development

### Building and Testing

```bash
# Install dependencies
npm run safe-install

# Run tests
npm test

# Build
npm run build

# Lint and format
npm run lint:fix
```

### Interactive REPL

The SDK includes an interactive REPL for quick testing and development:

```bash
# 1. Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your API keys

# 2. Start REPL
npm run repl
```

The REPL provides:
- Pre-initialized `client` (Freeplay instance)
- Environment variables: `projectId`, `sessionId`, `datasetId`, `apiBase`
- Type imports: `GenaiFunction`, `GenaiTool`
- Tab completion and syntax highlighting

Example REPL usage:
```javascript
freeplay> await client.recordings.create({
  projectId,
  allMessages: [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' }
  ],
  callInfo: { provider: 'openai', model: 'gpt-4' }
});
```

See [REPL.md](REPL.md) for detailed documentation.

## License

This SDK is released under the [Apache 2.0 License](LICENSE).

---

<p align="center">
  Built with ❤️ by the <a href="https://freeplay.ai">Freeplay</a> team
</p>
