/**
 * Tests for Metadata Update Functionality
 *
 * This module tests the metadata update feature for sessions and traces.
 *
 * Why this was created:
 * - Validates that the new Metadata resource class works correctly
 * - Ensures metadata updates are sent to the correct API endpoints with proper formatting
 * - Tests error handling for various failure scenarios (404, 500, etc.)
 * - Verifies HTTP methods (PATCH) and URL construction
 *
 * What it tests:
 * - Session metadata updates (success, errors, URL construction, HTTP methods)
 * - Trace metadata updates (success, errors, RESTful URL hierarchy)
 * - Edge cases (empty metadata, various data types)
 * - Request body formatting and validation
 *
 * Test coverage: 12 tests covering success paths, error handling, and edge cases.
 */

import { v4 as uuidv4 } from "uuid";
import Freeplay, { FreeplayClientError, FreeplayServerError } from "../../src";
import { getAxiosMock } from "../test_support";

describe("Metadata Updates", () => {
  const freeplayApiKey = "test-api-key";
  const baseUrl = "http://localhost:8080/api";
  const projectId = uuidv4();
  const sessionId = uuidv4();
  const traceId = uuidv4();
  const axiosMock = getAxiosMock();

  let freeplay: Freeplay;

  beforeEach(() => {
    axiosMock.reset();
    freeplay = new Freeplay({
      freeplayApiKey,
      baseUrl,
    });
  });

  describe("Session Metadata", () => {
    test("updates session metadata successfully", async () => {
      const metadata = {
        customer_id: "cust_123",
        rating: 5,
        premium: true,
      };

      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(200, { message: "Metadata updated successfully" });

      await expect(
        freeplay.metadata.updateSession({
          projectId,
          sessionId,
          metadata,
        }),
      ).resolves.toBeUndefined();

      expect(axiosMock.history.patch).toHaveLength(1);
      expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual(metadata);
    });

    test("throws error on 404 not found", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(404, {
          code: "entity_not_found",
          message: "Session not found",
        });

      await expect(
        freeplay.metadata.updateSession({
          projectId,
          sessionId,
          metadata: { key: "value" },
        }),
      ).rejects.toThrow(FreeplayClientError);
    });

    test("throws error on 500 server error", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(500, { error: "Internal server error" });

      await expect(
        freeplay.metadata.updateSession({
          projectId,
          sessionId,
          metadata: { key: "value" },
        }),
      ).rejects.toThrow(FreeplayServerError);
    });

    test("sends correct request body", async () => {
      const metadata = {
        string_key: "string_value",
        int_key: 42,
        float_key: 3.14,
        bool_key: true,
      };

      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(200, {});

      await freeplay.metadata.updateSession({
        projectId,
        sessionId,
        metadata,
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      const requestBody = JSON.parse(axiosMock.history.patch[0].data);
      expect(requestBody).toEqual(metadata);
      expect(requestBody.string_key).toBe("string_value");
      expect(requestBody.int_key).toBe(42);
      expect(requestBody.float_key).toBe(3.14);
      expect(requestBody.bool_key).toBe(true);
    });

    test("constructs correct URL", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(200, {});

      await freeplay.metadata.updateSession({
        projectId,
        sessionId,
        metadata: { key: "value" },
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      const requestUrl = axiosMock.history.patch[0].url;
      expect(requestUrl).toContain(`/projects/${projectId}/`);
      expect(requestUrl).toContain(`/sessions/id/${sessionId}/metadata`);
    });

    test("uses PATCH method", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(200, {});

      await freeplay.metadata.updateSession({
        projectId,
        sessionId,
        metadata: { key: "value" },
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      expect(axiosMock.history.post).toHaveLength(0);
      expect(axiosMock.history.put).toHaveLength(0);
    });
  });

  describe("Trace Metadata", () => {
    test("updates trace metadata successfully", async () => {
      const metadata = {
        resolution_category: "billing",
        resolved: true,
        resolution_time_ms: 1234,
      };

      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}/metadata`,
        )
        .reply(200, { message: "Metadata updated successfully" });

      await expect(
        freeplay.metadata.updateTrace({
          projectId,
          sessionId,
          traceId,
          metadata,
        }),
      ).resolves.toBeUndefined();

      expect(axiosMock.history.patch).toHaveLength(1);
      expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual(metadata);
    });

    test("throws error on 404 not found", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}/metadata`,
        )
        .reply(404, {
          code: "entity_not_found",
          message: "Trace not found",
        });

      await expect(
        freeplay.metadata.updateTrace({
          projectId,
          sessionId,
          traceId,
          metadata: { key: "value" },
        }),
      ).rejects.toThrow(FreeplayClientError);
    });

    test("constructs correct URL with session ID", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}/metadata`,
        )
        .reply(200, {});

      await freeplay.metadata.updateTrace({
        projectId,
        sessionId,
        traceId,
        metadata: { key: "value" },
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      const requestUrl = axiosMock.history.patch[0].url;
      expect(requestUrl).toContain(`/projects/${projectId}/`);
      expect(requestUrl).toContain(`/sessions/${sessionId}/`);
      expect(requestUrl).toContain(`/traces/id/${traceId}/metadata`);
    });

    test("sends correct request body", async () => {
      const metadata = {
        trace_key: "trace_value",
        count: 10,
        enabled: false,
      };

      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}/metadata`,
        )
        .reply(200, {});

      await freeplay.metadata.updateTrace({
        projectId,
        sessionId,
        traceId,
        metadata,
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      const requestBody = JSON.parse(axiosMock.history.patch[0].data);
      expect(requestBody).toEqual(metadata);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty metadata dict", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(200, {});

      await expect(
        freeplay.metadata.updateSession({
          projectId,
          sessionId,
          metadata: {},
        }),
      ).resolves.toBeUndefined();

      expect(axiosMock.history.patch).toHaveLength(1);
      expect(JSON.parse(axiosMock.history.patch[0].data)).toEqual({});
    });

    test("handles various data types", async () => {
      const complexMetadata = {
        string: "test",
        integer: 123,
        float: 45.67,
        boolean_true: true,
        boolean_false: false,
        zero: 0,
        negative: -42,
      };

      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/id/${sessionId}/metadata`,
        )
        .reply(200, {});

      await freeplay.metadata.updateSession({
        projectId,
        sessionId,
        metadata: complexMetadata,
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      const requestBody = JSON.parse(axiosMock.history.patch[0].data);
      expect(requestBody).toEqual(complexMetadata);
      expect(typeof requestBody.string).toBe("string");
      expect(typeof requestBody.integer).toBe("number");
      expect(typeof requestBody.float).toBe("number");
      expect(typeof requestBody.boolean_true).toBe("boolean");
      expect(typeof requestBody.boolean_false).toBe("boolean");
      expect(requestBody.zero).toBe(0);
      expect(requestBody.negative).toBe(-42);
    });
  });
});







