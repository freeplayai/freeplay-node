
# Changelog

Notable additions, fixes, or breaking changes to the Freeplay SDK.

## [0.5.3] - 2025-12-29

### Added

- Interactive REPL for development and testing:
  - `npm run repl` - Production mode (connects to app.freeplay.ai with SSL verification enabled)
  - `npm run repl -- --local` - Local development mode (connects to localhost:8000 with SSL verification disabled)
  - Pre-initialized `client` (Freeplay instance)
  - Environment variables automatically loaded from `.env` file

### Changed

- **Tool Schema Handling**: The SDK no longer provides `GenaiFunction` and `GenaiTool` TypeScript types. Tool schemas should be passed directly as objects in the provider's native format (e.g., from `@google/generative-ai` or Google Cloud Vertex AI SDKs). This aligns with how messages are handled - users pass provider-native types directly to Freeplay.

  ```typescript
  // Tool schemas are now passed as raw objects
  // matching the provider's format
  const toolSchema = [
    {
      functionDeclarations: [
        {
          name: "get_weather",
          description: "Get the current weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
              units: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
                description: "Temperature units",
              },
            },
            required: ["location"],
          },
        },
      ],
    },
  ];

  // Use in recordings
  await freeplay.recordings.create({
    projectId,
    allMessages: [...],
    toolSchema,
    callInfo: { provider: "vertex", model: "gemini-2.0-flash" },
  });
  ```

  **Notes:**
  - Backend automatically normalizes all tool schema formats (OpenAI, Anthropic, GenAI/Vertex)
  - No breaking changes to the API - tool schemas are still passed the same way
  - This approach is consistent with how we handle messages from different providers

## [0.5.4] - 2025-12-22

### Added

- New `Metadata` resource for updating session and trace metadata after creation:

  ```typescript
  // Update session metadata
  await fpClient.metadata.updateSession({
    projectId: "550e8400-e29b-41d4-a716-446655440000",
    sessionId: "660e8400-e29b-41d4-a716-446655440000",
    metadata: {
      customer_id: "cust_123",
      conversation_rating: 5,
      support_tier: "premium",
    },
  });

  // Update trace metadata
  await fpClient.metadata.updateTrace({
    projectId: "550e8400-e29b-41d4-a716-446655440000",
    sessionId: "660e8400-e29b-41d4-a716-446655440000",
    traceId: "770e8400-e29b-41d4-a716-446655440000",
    metadata: {
      resolution_category: "billing_credit_applied",
      ticket_id: "TICKET-12345678",
      resolved: true,
    },
  });
  ```

  This enables associating IDs and metadata with sessions/traces after conversation ends, eliminating the need to log dummy completions just to update metadata. New keys overwrite existing keys, preserving unmentioned keys (merge semantics).

## [0.5.2] - 2025-10-08

### Added

- Support bedrock/converse with examples

## [0.5.1] - 2025-10-07

- Add methods to create new prompt template versions, and to update the environments a template version is deployed to.

```javascript
const templateVersion = await fpClient.prompts.createVersion({
  projectId,
  promptTemplateId,
  content: [
    {
      content: "Answer this question as concisely as you can: {{question}}",
      role: "user",
    },
  ],
  model: "claude-4-sonnet-20250514",
  provider: "anthropic",
});

fpClient.prompts.updateVersionEnvironments({
  projectId,
  promptTemplateId,
  promptTemplateVersionId: templateVersion.prompt_template_version_id,
  environments: ["prod"],
});
```

### Added

- New `parentId` parameter in `RecordPayload` to replace the deprecated `traceInfo` parameter. This string field enables direct parent-child trace/completions relationships:

  ```javascript
  // Before (deprecated):
  const recordPayload = {
    projectId: projectId,
    allMessages: messages,
    traceInfo: traceInfo,
  };

  // After:
  const recordPayload = {
    projectId: projectId,
    allMessages: messages,
    parentId: parentId, // String ID of parent trace or completion
  };
  ```

- `parentId` parameter support in `Session.createTrace()`:
  ```javascript
  const parentTrace = session.createTrace({
    input: "Parent question",
    agentName: "parent_agent",
  });
  const childTrace = session.createTrace({
    input: "Child question",
    agentName: "child_agent",
    parentId: parentTrace.traceId, // Or it can be an ID of a completion
  });
  ```
- `parentId` parameter in `Session.restoreTrace()` method

### Change

- `RecordPayload.traceInfo` parameter is deprecated and will be removed in v0.6.0. Use `parentId` instead for trace hierarchy management.

## [0.5.0] - 2025-08-28

### Breaking changes

- `RecordPayload` now requires `projectId` as the first parameter. All code creating `RecordPayload` instances or calling `recordings.create()` must be updated to include this field.
- `PromptInfo` no longer contains a `projectId` field. The project ID must now be accessed from the project context instead.
- `RecordPayload.promptInfo` field has been renamed to `RecordPayload.promptVersionInfo` and now accepts `PromptVersionInfo` objects. Existing `PromptInfo` objects can still be passed, but the field name must be updated:

  ```javascript
  // Before:
  const recordPayload = {
    projectId: projectId,
    allMessages: messages,
    promptInfo: formattedPrompt.promptInfo,
  };

  // After:
  const recordPayload = {
    projectId: projectId,
    allMessages: messages,
    promptVersionInfo: formattedPrompt.promptInfo,
  };
  ```

### Changed

- In `RecordPayload`, the following fields are now optional:
  - `inputs` (Optional)
  - `promptVersionInfo` (Optional, renamed from `promptInfo`)
  - `callInfo` (Optional)
- `sessionInfo` in `RecordPayload` now has a default value and will be automatically generated if not provided.
- All fields in `CallInfo` are now optional.
- Add new optional field `targetEvaluationIds` to `TestRuns.create()` to control which evaluations run as part of a test.

## [0.4.1] - 2025-06-30

- Create a test run from the SDK with test cases with media in them.

## [0.4.0] - 2025-06-26

### Breaking changes

- `customerFeedback.update()` now requires a `projectId` parameter.

## [0.3.1] - 2025-05-29

- Create test run with a dataset that targets agent. Example:

  ```javascript
  const testRun = await fpClient.testRuns.create({
    projectId,
    testList: "Your dataset name that targets an agent",
    name: "Name your test run",
    description: "Some description",
    flavorName: templatePrompt.promptInfo.flavorName,
  });
  ```

  and then get traces test cases like

  ```javascript
  for await (const testCase of testRun.tracesTestCases) {
    // Run your test, record traces and completions.
  }
  ```

- Use traces when creating test run. Example:

  ```javascript
  await traceInfo.recordOutput(
    projectId,
    completion.choices[0].message.content,
    {
      "f1-score": 0.48,
      is_non_empty: true,
    },
    getTestRunInfo(testRun, testCase.id),
  );
  ```

### Updated

- Renamed `TestCase` type to `CompletionTestCase` type. The old `TestCase` is still exported as `TestCase` for backwards-compatibility, but is `@deprecated`.
- Both `CompletionTestCase` and `TraceTestCase` now surface `customMetadata` field if it was supplied when the dataset was built.

## [0.3.0] - 2025-05-12

### Added

- Added support for images, files and audio in prompt templates.

### Breaking changes

Moved the thin module into the main module, and removed the legacy completion methods.

If you are importing from `freeplay/thin`, you can update your imports to the top level module, for example:

Old import path:

```
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay/thin";
```

Updated import path:

```
import Freeplay, { getCallInfo, getSessionInfo } from "freeplay";
```
