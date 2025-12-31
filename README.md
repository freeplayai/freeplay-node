<h1 align="center">Freeplay Node SDK</h1>

<p align="center">
  <strong>The official Node/TypeScript SDK for <a href="https://freeplay.ai">Freeplay</a></strong><br/>
  The ops platform for enterprise AI engineering teams
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freeplay"><img src="https://img.shields.io/npm/v/freeplay.svg" alt="version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License" /></a>
</p>

<p align="center">
  <a href="https://docs.freeplay.ai">Docs</a> •
  <a href="https://docs.freeplay.ai/quick-start/observability-prompt-management">Quick Start</a> •
  <a href="https://docs.freeplay.ai/freeplay-sdk/setup">SDK Setup</a> •
  <a href="https://docs.freeplay.ai/resources/api-reference">API Reference</a> •
  <a href="CHANGELOG.md">Changelog</a> •
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Overview

Freeplay is the only platform your team needs to manage the end-to-end AI application development lifecycle. It provides an integrated workflow for improving your AI agents and other generative AI products. Engineers, data scientists, product managers, designers, and subject matter experts can all review production logs, curate datasets, experiment with changes, create and run evaluations, and deploy updates.

Use this SDK to integrate with Freeplay's core capabilities:

- [**Prompts**](https://docs.freeplay.ai/freeplay-sdk/prompts) — version, format, and fetch prompt templates across environments
- [**Recording**](https://docs.freeplay.ai/freeplay-sdk/recording-completions) — log LLM calls for observability and debugging
- [**Sessions**](https://docs.freeplay.ai/freeplay-sdk/sessions) & [**Traces**](https://docs.freeplay.ai/freeplay-sdk/traces) — group interactions and multi-step agent workflows
- [**Test Runs**](https://docs.freeplay.ai/freeplay-sdk/test-runs) — execute evaluation runs against prompts/datasets
- [**Feedback**](https://docs.freeplay.ai/freeplay-sdk/customer-feedback) — capture user/customer feedback and events

## Requirements

- Node.js 18 or higher
- A Freeplay account + API key

## Installation

```bash
npm install freeplay
```

## Quick Start

```typescript
import Freeplay from "freeplay";

const freeplay = new Freeplay({
  freeplayApiKey: process.env.FREEPLAY_API_KEY,
});

// Fetch a prompt from Freeplay
const prompt = await freeplay.prompts.getFormatted({
  projectId: process.env.FREEPLAY_PROJECT_ID,
  templateName: "my-prompt",
  environment: "prod",
  variables: { user_input: "Hello, world!" },
});

// Call your LLM provider with prompt.llmPrompt
const response = await openai.chat.completions.create({
  model: prompt.promptInfo.model,
  messages: prompt.llmPrompt,
});

// Record the result for observability
await freeplay.recordings.create({
  projectId: process.env.FREEPLAY_PROJECT_ID,
  allMessages: prompt.allMessages({
    role: "assistant",
    content: response.choices[0].message.content,
  }),
});
```

See the [SDK Setup guide](https://docs.freeplay.ai/freeplay-sdk/setup) for complete examples.

## Configuration

### Environment variables

```bash
export FREEPLAY_API_KEY="fp_..."
export FREEPLAY_PROJECT_ID="xy..."
# Optional: override if using a custom domain / private deployment
export FREEPLAY_API_BASE="https://app.freeplay.ai/api"
```

**API base URL**  
Default: `https://app.freeplay.ai/api`

Custom domain/private deployment: `https://<your-domain>/api`

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
  callInfo: { provider: "vertex", model: "gemini-2.0-flash" },
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

## Versioning

This SDK follows Semantic Versioning (SemVer): **MAJOR.MINOR.PATCH**.

- **PATCH**: bug fixes
- **MINOR**: backward-compatible features
- **MAJOR**: breaking changes

Before upgrading major versions, review the changelog.

### Building and Testing

```bash
# Install dependencies
npm run safe-install
```

## Support

- **Docs**: https://docs.freeplay.ai
- **Issues**: https://github.com/freeplayai/freeplay-node/issues
- **Security**: security@freeplay.ai

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

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

Apache-2.0 — see [LICENSE](LICENSE).
