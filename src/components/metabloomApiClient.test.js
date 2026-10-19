import {
  MetabloomApiError,
  getMetabloomApiErrorMessage,
  isMetabloomApiUnavailable,
  requestMetabloomResponse,
} from "./metabloomApiClient";

const headers = (contentType, requestRef = null) => ({
  get: (name) => name.toLowerCase() === "content-type" ? contentType : requestRef,
});

describe("Metabloom API client", () => {
  test("validates a JSON envelope", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers("application/json"),
      text: async () => JSON.stringify({
        version: "1.0.0",
        segments: [{ emote: "warm", response: "Welcome." }],
      }),
    });
    await expect(requestMetabloomResponse({
      fetchImpl,
      message: "Hello",
    })).resolves.toEqual({
      version: "1.0.0",
      segments: [{ emote: "warm", response: "Welcome." }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/metabloom",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ streamText: true, streamResearchProgress: true });
  });

  test("decodes NDJSON without requiring a streaming reader", async () => {
    const onSegment = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers("application/x-ndjson"),
      body: null,
      text: async () => [
        '{"type":"segment","index":0,"emote":"reflective","response":"Consider this."}',
        '{"type":"done","version":"1.0.0"}',
        "",
      ].join("\n"),
    });
    await expect(requestMetabloomResponse({
      fetchImpl,
      message: "Think",
      onSegment,
    })).resolves.toEqual({
      version: "1.0.0",
      segments: [{ emote: "reflective", response: "Consider this." }],
    });
    expect(onSegment).toHaveBeenCalledWith(
      { emote: "reflective", response: "Consider this." },
      0,
    );
  });

  test("treats an unconfigured optional endpoint as a demo fallback", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: headers("application/json"),
      json: async () => ({
        code: "not_configured",
        error: "Not configured.",
      }),
    });
    await expect(requestMetabloomResponse({
      fetchImpl,
      message: "Hello",
      optional: true,
    })).resolves.toBeNull();
    expect(isMetabloomApiUnavailable(new MetabloomApiError("x", {
      code: "not_configured",
      status: 503,
    }))).toBe(true);
  });

  test.each([
    [{ code: "provider_authentication_failed", requestRef: "012345abcdef" }, "provider_authentication_failed", "012345abcdef"],
    [{ code: "rate_limited", error: "Private provider diagnostic" }, "rate_limited", "abcdef012345"],
    [{ code: "authentication_required" }, "authentication_required", "abcdef012345"],
    [{ code: "Private provider diagnostic", requestRef: "012345abcdef" }, "request_failed", "abcdef012345"],
    [{ code: "research_timeout", requestRef: "invalid" }, "request_failed", "abcdef012345"],
  ])("surfaces only known HTTP failure details for %p", async (payload, code, requestRef) => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false, status: 502, headers: headers("application/json", "abcdef012345"),
      text: async () => JSON.stringify(payload),
    });
    const failure = await requestMetabloomResponse({ fetchImpl, message: "Investigate" }).catch((error) => error);
    expect(failure).toMatchObject({ code, requestRef, status: 502, message: getMetabloomApiErrorMessage(code) });
    expect(failure.message).not.toContain("Private provider diagnostic");
  });

  test("preserves a terminal stream error without a streaming reader or trailing newline", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: headers("application/x-ndjson"),
      text: async () => JSON.stringify({ type: "error", code: "research_no_sources", requestRef: "012345abcdef" }),
    });
    await expect(requestMetabloomResponse({ fetchImpl, message: "Investigate", optional: true })).rejects.toMatchObject({
      code: "research_no_sources", requestRef: "012345abcdef", message: getMetabloomApiErrorMessage("research_no_sources"),
    });
  });

  test("error fields reject unknown codes, unsafe references and invalid status values", () => {
    expect(new MetabloomApiError("Local message", {
      code: "constructor", requestRef: "012345abcdef\n", status: "502",
    })).toMatchObject({ code: "request_failed", requestRef: null, status: 0 });
    expect(new MetabloomApiError("Local message", {
      code: { toString: () => "research_timeout" }, requestRef: "ABCDEF012345", status: 999,
    })).toMatchObject({ code: "request_failed", requestRef: null, status: 0 });
  });
});
