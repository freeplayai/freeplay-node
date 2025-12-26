# Node SDK - GenAI Tool Schema Implementation Plan

**Feature**: Add GenAI tool schema support to Node SDK  
**Date**: December 26, 2025  
**Status**: Planning Phase

## Executive Summary

This document outlines the implementation plan to add GenAI tool schema support to the **Node SDK** (`freeplay-node`), mirroring the work completed for the Python SDK.

### Context

- ✅ **Backend**: Already supports GenAI tool schema format (normalizes VertexTool format)
- ✅ **Python SDK**: Implementation complete with types, tests, and testing guide
- ⏳ **Node SDK**: Needs equivalent TypeScript types and tests

### Goal

Provide Node/TypeScript users with typed interfaces for creating GenAI tool schemas, enabling better developer experience with:
- Type safety and autocomplete
- Clear documentation through TypeScript interfaces
- Parity with Python SDK functionality

### Key Principle: Backward Compatibility

**CRITICAL**: This is a purely additive change. Users currently passing Vertex format tool schemas (raw objects) will continue to work without any code changes.

---

## Background: GenAI Tool Schema Format

### Structure Comparison

**OpenAI/Anthropic**: Each tool is separate
```typescript
[
  { name: "tool1", description: "...", parameters: {...} },
  { name: "tool2", description: "...", parameters: {...} }
]
```

**GenAI/Vertex**: Single tool with multiple function declarations
```typescript
[
  {
    functionDeclarations: [
      { name: "tool1", description: "...", parameters: {...} },
      { name: "tool2", description: "...", parameters: {...} }
    ]
  }
]
```

### What We're Adding

TypeScript type aliases that represent the GenAI format:

```typescript
export type GenaiFunction = {
  name: string;
  description: string;
  parameters: Record<string, any>;  // JSON Schema
};

export type GenaiTool = {
  functionDeclarations: GenaiFunction[];
};
```

---

## Phased Implementation Plan

### Phase 1: Add TypeScript Types (1-2 hours)

**Goal**: Add GenaiFunction and GenaiTool interfaces to the SDK

#### Task 1.1: Add Type Definitions

**File**: `freeplay-node/src/model.ts`

**Add after line 531** (after existing tool/schema types):

```typescript
// Tool schema types for Google GenAI/Vertex AI

/**
 * Function declaration for Google GenAI API tool schema format.
 * 
 * Represents a single function that can be called by the model.
 * This is the building block for GenaiTool.
 * 
 * @example
 * ```typescript
 * const weatherFunction: GenaiFunction = {
 *   name: "get_weather",
 *   description: "Get the current weather for a location",
 *   parameters: {
 *     type: "object",
 *     properties: {
 *       location: {
 *         type: "string",
 *         description: "City name, e.g., 'San Francisco'"
 *       },
 *       units: {
 *         type: "string",
 *         enum: ["celsius", "fahrenheit"],
 *         description: "Temperature units"
 *       }
 *     },
 *     required: ["location"]
 *   }
 * };
 * ```
 */
export type GenaiFunction = {
  name: string;
  description: string;
  parameters: Record<string, any>;  // JSON Schema
};

/**
 * Tool schema format for Google GenAI API.
 * 
 * GenAI uses a different structure than OpenAI/Anthropic:
 * - A single Tool contains multiple FunctionDeclarations
 * - Same format is used by both GenAI API and Vertex AI
 * 
 * This is the key difference: OpenAI/Anthropic pass tools as an array,
 * while GenAI wraps multiple functions in a single tool object.
 * 
 * @example
 * ```typescript
 * // Single function
 * const toolSchema: GenaiTool[] = [
 *   {
 *     functionDeclarations: [weatherFunction]
 *   }
 * ];
 * 
 * // Multiple functions in one tool (GenAI-specific feature)
 * const toolSchema: GenaiTool[] = [
 *   {
 *     functionDeclarations: [
 *       weatherFunction,
 *       newsFunction,
 *       searchFunction
 *     ]
 *   }
 * ];
 * ```
 */
export type GenaiTool = {
  functionDeclarations: GenaiFunction[];
};
```

**Why**: Provides type safety and autocomplete for GenAI tool schemas

---

#### Task 1.2: Verify Exports

**File**: `freeplay-node/src/index.ts`

**Check**: Line 42 already exports from model.ts:
```typescript
export * from "./model.js";
```

**Action**: No changes needed - GenaiFunction and GenaiTool will be automatically exported

**Verification**:
```bash
cd freeplay-node
npm run build
```

Check that `dist/model.d.ts` contains the new interfaces.

---

#### Task 1.3: Update RecordPayload Type Hint (Optional)

**File**: `freeplay-node/src/resources/recordings.ts`

**Current** (line 113):
```typescript
toolSchema?: FormattedToolSchema[];
```

**Optional Enhancement** - Add JSDoc to clarify accepted formats:
```typescript
/**
 * Tool schema in provider-specific format.
 * 
 * Supported formats:
 * - OpenAI: Array of {function: {...}, type: "function"}
 * - Anthropic: Array of {name, description, input_schema}
 * - GenAI/Vertex: Array of GenaiTool with functionDeclarations
 * 
 * @example
 * ```typescript
 * // GenAI format
 * import { GenaiFunction, GenaiTool } from 'freeplay-sdk';
 * 
 * const toolSchema: GenaiTool[] = [{
 *   functionDeclarations: [{
 *     name: "get_weather",
 *     description: "Get weather",
 *     parameters: { type: "object", properties: {...} }
 *   }]
 * }];
 * ```
 */
toolSchema?: FormattedToolSchema[];
```

**Why**: Improves documentation without breaking changes

---

### Phase 2: Create Unit Tests (2-3 hours)

**Goal**: Comprehensive test coverage matching Python SDK (7 tests)

#### Task 2.1: Create Test File

**File**: `freeplay-node/test/genai-tools.test.ts`

**Content**:

```typescript
/**
 * Unit tests for GenAI tool schema types.
 * Tests the GenaiFunction and GenaiTool types and their serialization.
 */

import { GenaiFunction, GenaiTool } from "../src/model.js";

describe("GenAI Tool Schema Types", () => {
  describe("GenaiFunction", () => {
    test("should create a GenaiFunction with proper structure", () => {
      const func: GenaiFunction = {
        name: "get_weather",
        description: "Get the current weather in a given location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state, e.g. San Francisco, CA",
            },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description: "The unit of temperature",
            },
          },
          required: ["location"],
        },
      };

      expect(func.name).toBe("get_weather");
      expect(func.description).toBe(
        "Get the current weather in a given location"
      );
      expect(func.parameters.properties).toHaveProperty("location");
      expect(func.parameters.required).toEqual(["location"]);
    });
  });

  describe("GenaiTool - Single Function", () => {
    test("should create a GenaiTool with a single function declaration", () => {
      const func: GenaiFunction = {
        name: "get_weather",
        description: "Get weather information",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      };

      const tool: GenaiTool = {
        functionDeclarations: [func],
      };

      expect(tool.functionDeclarations).toHaveLength(1);
      expect(tool.functionDeclarations[0].name).toBe("get_weather");
    });
  });

  describe("GenaiTool - Multiple Functions", () => {
    test("should create a GenaiTool with multiple function declarations", () => {
      const getWeather: GenaiFunction = {
        name: "get_weather",
        description: "Get the current weather",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      };

      const getNews: GenaiFunction = {
        name: "get_news",
        description: "Get the latest news",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string", description: "The news topic" },
            limit: { type: "integer", description: "Number of articles" },
          },
          required: ["topic"],
        },
      };

      const tool: GenaiTool = {
        functionDeclarations: [getWeather, getNews],
      };

      expect(tool.functionDeclarations).toHaveLength(2);
      expect(tool.functionDeclarations[0].name).toBe("get_weather");
      expect(tool.functionDeclarations[1].name).toBe("get_news");
    });
  });

  describe("Serialization", () => {
    test("should serialize GenaiTool to JSON correctly", () => {
      const func: GenaiFunction = {
        name: "calculate_sum",
        description: "Calculate the sum of two numbers",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number", description: "First number" },
            b: { type: "number", description: "Second number" },
          },
          required: ["a", "b"],
        },
      };

      const tool: GenaiTool = {
        functionDeclarations: [func],
      };

      // Test JSON serialization
      const jsonString = JSON.stringify(tool);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toHaveProperty("functionDeclarations");
      expect(parsed.functionDeclarations).toHaveLength(1);
      expect(parsed.functionDeclarations[0].name).toBe("calculate_sum");
    });

    test("should match expected GenAI API format", () => {
      const func: GenaiFunction = {
        name: "search",
        description: "Search for information",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      };

      const tool: GenaiTool = {
        functionDeclarations: [func],
      };

      // Verify the structure matches GenAI API format:
      // {
      //   "functionDeclarations": [
      //     {
      //       "name": "search",
      //       "description": "Search for information",
      //       "parameters": {...}
      //     }
      //   ]
      // }
      expect(tool).toHaveProperty("functionDeclarations");
      expect(Array.isArray(tool.functionDeclarations)).toBe(true);

      const firstFunction = tool.functionDeclarations[0];
      expect(firstFunction.name).toBe("search");
      expect(firstFunction.description).toBe("Search for information");
      expect(firstFunction.parameters).toHaveProperty("type");
      expect(firstFunction.parameters.type).toBe("object");
      expect(firstFunction.parameters.properties).toHaveProperty("query");
    });
  });

  describe("Edge Cases", () => {
    test("should allow empty function declarations", () => {
      const tool: GenaiTool = {
        functionDeclarations: [],
      };

      expect(tool.functionDeclarations).toHaveLength(0);
    });

    test("should handle complex nested parameter schema", () => {
      const func: GenaiFunction = {
        name: "book_flight",
        description: "Book a flight with passenger and destination details",
        parameters: {
          type: "object",
          properties: {
            passenger: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "integer" },
                passport: { type: "string" },
              },
              required: ["name", "passport"],
            },
            destination: {
              type: "object",
              properties: {
                airport_code: { type: "string" },
                city: { type: "string" },
                country: { type: "string" },
              },
              required: ["airport_code"],
            },
            dates: {
              type: "object",
              properties: {
                departure: { type: "string", format: "date" },
                return: { type: "string", format: "date" },
              },
              required: ["departure"],
            },
          },
          required: ["passenger", "destination", "dates"],
        },
      };

      const tool: GenaiTool = {
        functionDeclarations: [func],
      };

      // Verify complex schema is preserved
      const firstFunction = tool.functionDeclarations[0];
      expect(firstFunction.parameters.properties).toHaveProperty("passenger");
      expect(firstFunction.parameters.properties).toHaveProperty("destination");
      expect(firstFunction.parameters.properties).toHaveProperty("dates");

      // Verify nested properties
      const passenger = firstFunction.parameters.properties.passenger;
      expect(passenger.type).toBe("object");
      expect(passenger.properties).toHaveProperty("name");
      expect(passenger.properties).toHaveProperty("passport");
    });
  });

  describe("Type Safety", () => {
    test("should enforce required fields at compile time", () => {
      // This test verifies TypeScript compilation
      // If these compile without errors, the types are correct

      // @ts-expect-error - missing required fields
      const invalidFunc1: GenaiFunction = {
        name: "test",
      };

      // @ts-expect-error - missing required fields
      const invalidFunc2: GenaiFunction = {
        name: "test",
        description: "test",
      };

      // Valid - all required fields
      const validFunc: GenaiFunction = {
        name: "test",
        description: "test",
        parameters: {},
      };

      expect(validFunc).toBeDefined();
    });
  });
});
```

**Why**: Ensures types work correctly and match expected GenAI format

---

#### Task 2.2: Run Tests

**Commands**:
```bash
cd freeplay-node
npm test -- genai-tools.test.ts
```

**Expected Result**: All 7+ tests passing

---

### Phase 3: Create Testing Guide (2-3 hours)

**Goal**: Manual testing guide for end-to-end validation

#### Task 3.1: Create Testing Guide Document

**File**: `freeplay-node/NODE_GENAI_TESTING_GUIDE.md`

**Content**: See separate section below for full content

**Why**: Provides step-by-step instructions for manual verification

---

#### Task 3.2: Create Example Script (Optional)

**File**: `freeplay-node/examples/src/genai-tool-example.ts`

**Content**:

```typescript
/**
 * Example: Using GenAI tool schema format
 * 
 * This example demonstrates how to use the GenaiFunction and GenaiTool
 * types to create tool schemas for Google GenAI/Vertex AI.
 */

import Freeplay, { GenaiFunction, GenaiTool, RecordPayload } from "../../src/index.js";

async function main() {
  const client = new Freeplay({
    freeplayApiKey: process.env.FREEPLAY_API_KEY!,
    baseUrl: process.env.FREEPLAY_BASE_URL || "https://api.freeplay.ai",
  });

  const projectId = process.env.FREEPLAY_PROJECT_ID!;

  // Example 1: Single function
  const weatherFunction: GenaiFunction = {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name, e.g., 'San Francisco'",
        },
        units: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature units",
        },
      },
      required: ["location"],
    },
  };

  const toolSchema: GenaiTool[] = [
    {
      functionDeclarations: [weatherFunction],
    },
  ];

  console.log("Recording with GenAI tool schema...");

  const response = await client.recordings.create({
    projectId,
    allMessages: [
      { role: "user", content: "What's the weather in San Francisco?" },
      { role: "assistant", content: "Let me check the weather for you." },
    ],
    toolSchema,
    callInfo: {
      provider: "genai",
      model: "gemini-2.0-flash",
    },
  } as RecordPayload);

  console.log(`✅ Recording created: ${response.completion_id}`);

  // Example 2: Multiple functions
  const functions: GenaiFunction[] = [
    weatherFunction,
    {
      name: "get_news",
      description: "Get latest news",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
        },
        required: ["topic"],
      },
    },
    {
      name: "search_web",
      description: "Search the web",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  ];

  const multiToolSchema: GenaiTool[] = [
    {
      functionDeclarations: functions,
    },
  ];

  const response2 = await client.recordings.create({
    projectId,
    allMessages: [
      { role: "user", content: "Give me weather, news, and search results" },
      { role: "assistant", content: "I'll help with all three." },
    ],
    toolSchema: multiToolSchema,
    callInfo: {
      provider: "genai",
      model: "gemini-2.0-flash",
    },
  } as RecordPayload);

  console.log(`✅ Multi-function recording created: ${response2.completion_id}`);
}

main().catch(console.error);
```

**Why**: Provides working example for users

---

### Phase 4: Documentation Updates (1 hour)

#### Task 4.1: Update README (Optional)

**File**: `freeplay-node/README.md`

**Add section** (if tool schema documentation exists):

```markdown
### Tool Schemas

The SDK supports multiple tool schema formats:

#### GenAI/Vertex AI Format

```typescript
import { GenaiFunction, GenaiTool } from 'freeplay-sdk';

const toolSchema: GenaiTool[] = [{
  functionDeclarations: [
    {
      name: "get_weather",
      description: "Get weather information",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" }
        },
        required: ["location"]
      }
    }
  ]
}];
```

#### OpenAI Format

```typescript
const toolSchema = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get weather information",
    parameters: { /* ... */ }
  }
}];
```
```

**Why**: Helps users discover the feature

---

#### Task 4.2: Update CHANGELOG

**File**: `freeplay-node/CHANGELOG.md`

**Add entry** (in unreleased or next version section):

```markdown
### Added

- Added `GenaiFunction` and `GenaiTool` TypeScript types for Google GenAI/Vertex AI tool schema format
- Added comprehensive unit tests for GenAI tool schema types
- Added testing guide and examples for GenAI tool schemas

### Notes

- This is a backward-compatible change - existing tool schema formats continue to work
- The new types provide better type safety and developer experience for GenAI/Vertex AI users
```

**Why**: Documents the change for release notes

---

### Phase 5: CI/CD Verification (30 minutes)

#### Task 5.1: Verify Build

**Commands**:
```bash
cd freeplay-node
npm run build
```

**Expected**: Clean build with no errors

---

#### Task 5.2: Verify All Tests Pass

**Commands**:
```bash
npm test
```

**Expected**: All tests pass, including new genai-tools tests

---

#### Task 5.3: Verify Type Exports

**Commands**:
```bash
# Check that types are in the built .d.ts files
cat dist/model.d.ts | grep -A 5 "GenaiFunction"
cat dist/model.d.ts | grep -A 5 "GenaiTool"
```

**Expected**: Both interfaces present in type definitions

---

## Testing Strategy

### Unit Tests (Automated)
- ✅ Type creation and structure
- ✅ Single function declarations
- ✅ Multiple function declarations
- ✅ JSON serialization
- ✅ Format validation
- ✅ Complex nested schemas
- ✅ Edge cases

### Manual Tests (Follow Guide)
- ✅ Create recording with single function
- ✅ Create recording with multiple functions
- ✅ Verify database storage
- ✅ Verify backend normalization
- ✅ Check server logs

### Integration Tests (Optional)
- Could add to existing `test/integration/vertexAITools.test.ts`
- Use GenaiFunction/GenaiTool types instead of raw objects

---

## Success Criteria

### Must Have
- ✅ GenaiFunction and GenaiTool types added to model.ts
- ✅ Types exported from main index.ts
- ✅ All 7+ unit tests passing
- ✅ npm run build succeeds
- ✅ Type definitions (.d.ts) include new types
- ✅ CHANGELOG updated

### Should Have
- ✅ Testing guide created with manual test steps
- ✅ Example script demonstrating usage
- ✅ JSDoc comments on RecordPayload.toolSchema

### Nice to Have
- ✅ README section on tool schemas
- ✅ Integration test using new types
- ✅ Example in examples/ts-cjs directory

---

## Risk Assessment

### Low Risk ✅

**Why**: This is a purely additive change:
1. No existing code needs to change
2. Backward compatible - existing tool schemas still work
3. Just TypeScript interface additions
4. Backend already supports the format
5. Mirrors proven Python SDK implementation

### Rollback Plan

If issues arise:
1. Revert the commit adding GenaiFunction/GenaiTool
2. Remove test file
3. Remove testing guide

Impact: None - feature is opt-in, existing code unaffected

---

## Timeline Estimate

| Phase | Time | Deliverable |
|-------|------|-------------|
| Phase 1: Types | 1-2 hours | GenaiFunction & GenaiTool types in model.ts |
| Phase 2: Tests | 2-3 hours | genai-tools.test.ts with 7+ tests |
| Phase 3: Guide | 2-3 hours | Testing guide & examples |
| Phase 4: Docs | 1 hour | README, CHANGELOG updates |
| Phase 5: CI/CD | 30 min | Build & test verification |
| **Total** | **7-10 hours** | Complete feature |

---

## Implementation Checklist

### Phase 1: Types
- [ ] Add GenaiFunction type to model.ts (after line 531)
- [ ] Add GenaiTool type to model.ts
- [ ] Add JSDoc comments
- [ ] Verify exports in index.ts
- [ ] Run `npm run build`
- [ ] Check dist/model.d.ts for types

### Phase 2: Tests
- [ ] Create test/genai-tools.test.ts
- [ ] Write 7+ comprehensive tests
- [ ] Run `npm test -- genai-tools.test.ts`
- [ ] Ensure all tests pass

### Phase 3: Guide
- [ ] Create NODE_GENAI_TESTING_GUIDE.md
- [ ] Include 3 manual test scenarios
- [ ] Add database verification steps
- [ ] Create example script (optional)

### Phase 4: Docs
- [ ] Update CHANGELOG.md
- [ ] Update README.md (optional)
- [ ] Add JSDoc to RecordPayload (optional)

### Phase 5: Verification
- [ ] Run full test suite: `npm test`
- [ ] Build: `npm run build`
- [ ] Verify type exports
- [ ] Manual smoke test (if possible)

### Final
- [ ] Code review
- [ ] PR created
- [ ] CI passes
- [ ] Merge to main

---

## References

- ✅ Python SDK Implementation: `freeplay-python/src/freeplay/model.py` (lines 122-142)
- ✅ Python SDK Tests: `freeplay-python/tests/test_genai_tools.py`
- ✅ Python Testing Guide: `freeplay-python/PYTHON_GENAI_TESTING_GUIDE.md`
- ✅ GenAI Feature Plan: `GENAI_IMPLEMENTATION_PLAN.md`
- ✅ Backend Normalization: `freeplay-app/server/record/record_service.py` (lines 487-597)

---

## Questions / Decisions Needed

### Q1: Should we add integration tests?
**Recommendation**: Optional - unit tests + manual testing guide should be sufficient

### Q2: Should we update existing examples?
**Recommendation**: Add new example, leave existing examples unchanged

### Q3: Version bump needed?
**Recommendation**: Minor version bump (feature addition, backward compatible)

### Q4: TypeScript strict mode considerations?
**Decision**: Use `Record<string, any>` for parameters (matches model.ts patterns and Python SDK implementation)

---

## Next Steps

1. ✅ Review this plan with team
2. ⏳ Get approval to proceed
3. ⏳ Begin Phase 1: Add TypeScript types
4. ⏳ Continue through phases sequentially
5. ⏳ Create PR when complete

---

**Status**: Ready for implementation  
**Estimated Completion**: 1-2 days (including testing & review)

