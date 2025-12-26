# Interactive REPL

The Node SDK includes an interactive REPL (Read-Eval-Print Loop) for quick testing and development.

## Setup

1. **Create `.env` file** (copy from `.env.example` if it exists):

```bash
# .env
FREEPLAY_API_KEY=your_api_key_here
FREEPLAY_API_URL=http://localhost:8000
FREEPLAY_PROJECT_ID=your_project_id_here

# Optional
FREEPLAY_SESSION_ID=
FREEPLAY_DATASET_ID=
```

2. **Install dependencies** (if dotenv isn't installed yet):

```bash
npm install
```

## Usage

Start the REPL:

```bash
npm run repl
```

This will:
- Load environment variables from `.env`
- Initialize the Freeplay client
- Start an interactive Node.js REPL session

## Available Variables

The REPL automatically provides these variables:

- `client` - Initialized Freeplay client instance
- `projectId` - From `FREEPLAY_PROJECT_ID`
- `sessionId` - From `FREEPLAY_SESSION_ID`
- `datasetId` - From `FREEPLAY_DATASET_ID`
- `apiBase` - From `FREEPLAY_API_URL`
- `Freeplay` - Main SDK class for creating new instances
- `GenaiFunction` - GenAI function type (for tool schemas)
- `GenaiTool` - GenAI tool type (for tool schemas)

## Example Commands

### Basic Recording

```javascript
await client.recordings.create({
  projectId,
  allMessages: [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' }
  ],
  callInfo: { provider: 'openai', model: 'gpt-4' }
});
```

### Update Session Metadata

```javascript
await client.metadata.updateSession({
  projectId,
  sessionId,
  metadata: { test_key: 'Hello from Node!' }
});
```

### GenAI Tool Schema

```javascript
const weatherFunction = {
  name: 'get_weather',
  description: 'Get weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string' }
    },
    required: ['location']
  }
};

const toolSchema = [{
  functionDeclarations: [weatherFunction]
}];

await client.recordings.create({
  projectId,
  allMessages: [...],
  toolSchema,
  callInfo: { provider: 'genai', model: 'gemini-2.0-flash' }
});
```

## Tips

- Use `await` for async operations
- Use `.exit` or Ctrl+D to exit the REPL
- Use tab completion to explore available methods
- Use `console.log()` for debugging

## Troubleshooting

### Missing API Key

If you see "⚠️ Warning: FREEPLAY_API_KEY not set in .env":
1. Check that `.env` file exists in the project root
2. Verify `FREEPLAY_API_KEY` is set in `.env`
3. Restart the REPL

### Import Errors

If you get import errors, rebuild the SDK:

```bash
npm run build
npm run repl
```

