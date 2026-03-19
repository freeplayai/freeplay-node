import { v4 as uuidv4 } from "uuid";
import Freeplay, { FreeplayClientError, FreeplayServerError } from "../../src";
import { getAxiosMock } from "../test_support";

describe("Traces Update", () => {
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

  describe("Success cases", () => {
    test("updates trace with output only", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(200, { message: "Trace updated successfully" });

      await expect(
        freeplay.traces.update({
          projectId,
          sessionId,
          traceId,
          output: { result: "updated output" },
        }),
      ).resolves.toBeUndefined();

      expect(axiosMock.history.patch).toHaveLength(1);
      const body = JSON.parse(axiosMock.history.patch[0].data);
      expect(body.output).toEqual({ result: "updated output" });
      expect(body.eval_results).toBeUndefined();
    });

    test("updates trace with eval results only", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(200, { message: "Trace updated successfully" });

      await expect(
        freeplay.traces.update({
          projectId,
          sessionId,
          traceId,
          evalResults: { accuracy: 0.95, valid: true },
        }),
      ).resolves.toBeUndefined();

      expect(axiosMock.history.patch).toHaveLength(1);
      const body = JSON.parse(axiosMock.history.patch[0].data);
      expect(body.eval_results).toEqual({ accuracy: 0.95, valid: true });
      expect(body.output).toBeUndefined();
    });

    test("updates trace with both output and eval results", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(200, { message: "Trace updated successfully" });

      await expect(
        freeplay.traces.update({
          projectId,
          sessionId,
          traceId,
          output: "new output text",
          evalResults: { score: 0.8 },
        }),
      ).resolves.toBeUndefined();

      expect(axiosMock.history.patch).toHaveLength(1);
      const body = JSON.parse(axiosMock.history.patch[0].data);
      expect(body.output).toBe("new output text");
      expect(body.eval_results).toEqual({ score: 0.8 });
    });
  });

  describe("URL construction", () => {
    test("constructs correct URL with all IDs", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(200, {});

      await freeplay.traces.update({
        projectId,
        sessionId,
        traceId,
        output: "test",
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      const requestUrl = axiosMock.history.patch[0].url;
      expect(requestUrl).toContain(`/projects/${projectId}/`);
      expect(requestUrl).toContain(`/sessions/${sessionId}/`);
      expect(requestUrl).toContain(`/traces/id/${traceId}`);
      expect(requestUrl).not.toContain("/metadata");
    });

    test("uses PATCH method", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(200, {});

      await freeplay.traces.update({
        projectId,
        sessionId,
        traceId,
        output: "test",
      });

      expect(axiosMock.history.patch).toHaveLength(1);
      expect(axiosMock.history.post).toHaveLength(0);
      expect(axiosMock.history.put).toHaveLength(0);
    });
  });

  describe("Error handling", () => {
    test("throws when neither output nor evalResults provided", async () => {
      await expect(
        freeplay.traces.update({
          projectId,
          sessionId,
          traceId,
        }),
      ).rejects.toThrow("At least one of 'output' or 'evalResults'");
    });

    test("throws error on 404 not found", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(404, {
          code: "trace_not_found",
          message: "Trace not found",
        });

      await expect(
        freeplay.traces.update({
          projectId,
          sessionId,
          traceId,
          output: "test",
        }),
      ).rejects.toThrow(FreeplayClientError);
    });

    test("throws error on 500 server error", async () => {
      axiosMock
        .onPatch(
          `${baseUrl}/v2/projects/${projectId}/sessions/${sessionId}/traces/id/${traceId}`,
        )
        .reply(500, { error: "Internal server error" });

      await expect(
        freeplay.traces.update({
          projectId,
          sessionId,
          traceId,
          evalResults: { score: 1.0 },
        }),
      ).rejects.toThrow(FreeplayServerError);
    });
  });
});
