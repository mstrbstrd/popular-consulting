import {
  MetabloomApiError,
  isMetabloomApiUnavailable,
  requestMetabloomResponse,
} from "./metabloomApiClient";

const headers = (contentType) => ({
  get: (name) => name.toLowerCase() === "content-type" ? contentType : null,
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
});
