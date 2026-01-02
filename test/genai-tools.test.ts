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
        "Get the current weather in a given location",
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

  describe("Array Usage", () => {
    test("should work as array for RecordPayload compatibility", () => {
      const func1: GenaiFunction = {
        name: "function1",
        description: "First function",
        parameters: { type: "object", properties: {} },
      };

      const func2: GenaiFunction = {
        name: "function2",
        description: "Second function",
        parameters: { type: "object", properties: {} },
      };

      // This is how it would be used in RecordPayload
      const toolSchema: GenaiTool[] = [
        {
          functionDeclarations: [func1, func2],
        },
      ];

      expect(toolSchema).toHaveLength(1);
      expect(toolSchema[0].functionDeclarations).toHaveLength(2);
    });

    test("should serialize array of GenaiTool correctly", () => {
      const tool: GenaiTool = {
        functionDeclarations: [
          {
            name: "test_function",
            description: "Test",
            parameters: { type: "object", properties: {} },
          },
        ],
      };

      const toolSchema: GenaiTool[] = [tool];
      const jsonString = JSON.stringify(toolSchema);
      const parsed = JSON.parse(jsonString);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].functionDeclarations).toHaveLength(1);
      expect(parsed[0].functionDeclarations[0].name).toBe("test_function");
    });
  });

  describe("Parameter Flexibility", () => {
    test("should accept any valid JSON Schema in parameters", () => {
      const func: GenaiFunction = {
        name: "flexible_function",
        description: "Function with various parameter types",
        parameters: {
          type: "object",
          properties: {
            stringProp: { type: "string" },
            numberProp: { type: "number" },
            booleanProp: { type: "boolean" },
            arrayProp: { type: "array", items: { type: "string" } },
            objectProp: {
              type: "object",
              properties: {
                nested: { type: "string" },
              },
            },
            enumProp: { type: "string", enum: ["option1", "option2"] },
            constProp: { const: "constant_value" },
          },
          required: ["stringProp"],
          additionalProperties: false,
        },
      };

      const tool: GenaiTool = {
        functionDeclarations: [func],
      };

      expect(tool.functionDeclarations[0].parameters.properties).toHaveProperty(
        "stringProp",
      );
      expect(tool.functionDeclarations[0].parameters.properties).toHaveProperty(
        "arrayProp",
      );
      expect(tool.functionDeclarations[0].parameters).toHaveProperty(
        "additionalProperties",
      );
    });

    test("should handle empty parameters object", () => {
      const func: GenaiFunction = {
        name: "no_params",
        description: "Function with no parameters",
        parameters: {},
      };

      const tool: GenaiTool = {
        functionDeclarations: [func],
      };

      expect(tool.functionDeclarations[0].parameters).toEqual({});
    });
  });

  describe("Real-world Examples", () => {
    test("should support typical tool calling scenario", () => {
      // Example: Multi-tool schema for a virtual assistant
      const getWeather: GenaiFunction = {
        name: "get_weather",
        description: "Get current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name or coordinates",
            },
            units: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              default: "celsius",
            },
          },
          required: ["location"],
        },
      };

      const searchWeb: GenaiFunction = {
        name: "search_web",
        description: "Search the web for information",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
          },
          required: ["query"],
        },
      };

      const sendEmail: GenaiFunction = {
        name: "send_email",
        description: "Send an email message",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", format: "email" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
      };

      const toolSchema: GenaiTool[] = [
        {
          functionDeclarations: [getWeather, searchWeb, sendEmail],
        },
      ];

      // Verify the complete structure
      expect(toolSchema).toHaveLength(1);
      expect(toolSchema[0].functionDeclarations).toHaveLength(3);
      expect(toolSchema[0].functionDeclarations[0].name).toBe("get_weather");
      expect(toolSchema[0].functionDeclarations[1].name).toBe("search_web");
      expect(toolSchema[0].functionDeclarations[2].name).toBe("send_email");

      // Verify it serializes correctly
      const serialized = JSON.stringify(toolSchema);
      const parsed = JSON.parse(serialized);
      expect(parsed[0].functionDeclarations).toHaveLength(3);
    });
  });
});

