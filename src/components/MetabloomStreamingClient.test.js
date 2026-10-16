import { TextEncoder, TextDecoder } from "util";
import { requestMetabloomResponse } from "./metabloomApiClient";
const first = { emote: "whimsy", response: "A playful 🪴 opening." };
const second = { emote: "reflective", response: "A considered continuation." };
const line = (segment, index) => JSON.stringify({ type: "segment", index, ...segment }) + "\n";
const done = '{"type":"done","version":"1.0.0"}\n';
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const transport = () => {
  let provide;
  const reader = {
    read: jest.fn(() => new Promise((resolve) => { provide = resolve; })),
    cancel: jest.fn(async () => {}), releaseLock: jest.fn(),
  };
  return {
    reader,
    fetchImpl: jest.fn(async () => ({ ok: true, headers: { get: () => "application/x-ndjson" }, body: { getReader: () => reader } })),
    send: async (text) => { provide({ value: new TextEncoder().encode(text), done: false }); await flush(); },
    close: async () => { provide({ done: true }); await flush(); },
  };
};

describe("HTTP segment arrival, not whole-response buffering", () => {
  const previousDecoder = global.TextDecoder;
  beforeAll(() => { global.TextDecoder = TextDecoder; });
  afterAll(() => { global.TextDecoder = previousDecoder; });

  test("onSegment fires while the body is open, and EOF does not replay it", async () => {
    const io = transport(); const onSegment = jest.fn(); let finished = false;
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", allowMultiple: true, onSegment });
    request.then(() => { finished = true; });
    await flush();
    const record = line(first, 0);
    await io.send(record.slice(0, 40));
    expect(onSegment).not.toHaveBeenCalled();
    await io.send(record.slice(40));
    expect(onSegment).toHaveBeenCalledWith(first, 0);
    expect(finished).toBe(false);
    await io.send(line(second, 1));
    expect(onSegment).toHaveBeenCalledTimes(2);
    expect(finished).toBe(false);
    await io.send(done);
    await io.close();
    await expect(request).resolves.toEqual({ version: "1.0.0", segments: [first, second] });
    expect(onSegment).toHaveBeenCalledTimes(2);
    expect(io.reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  test("Jev gestures bracket v2 streaming and the final reaction waits for verified done", async () => {
    const io = transport(); const onSegment = jest.fn(); const onReaction = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onSegment, onReaction });
    await flush();
    await io.send('{"type":"emote","phase":"input","emote":"curious"}\n');
    expect(onReaction).toHaveBeenCalledWith({ phase: "input", emote: "curious" });
    await io.send('{"type":"segment","index":0,"response":"The answer starts now."}\n');
    expect(onSegment).toHaveBeenCalledWith({ response: "The answer starts now." }, 0);
    await io.send('{"type":"text_complete"}\n');
    await io.send('{"type":"emote","phase":"response","emote":"resolute"}\n');
    expect(onReaction).toHaveBeenCalledTimes(1);
    await io.send('{"type":"done","version":"2.0.0"}\n');
    expect(onReaction).toHaveBeenCalledWith({ phase: "response", emote: "resolute" });
    await io.close();
    await expect(request).resolves.toEqual({ version: "2.0.0", segments: [{ response: "The answer starts now." }] });
    expect(onReaction).toHaveBeenCalledTimes(2);
  });

  test("a disconnect after a valid prefix never becomes a successful demo response", async () => {
    const io = transport(); const onSegment = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", allowMultiple: true, onSegment, optional: true });
    const failure = request.catch((error) => error);
    await flush(); await io.send(line(first, 0)); await io.close();
    expect(await failure).toMatchObject({ code: "invalid_response" });
    expect(onSegment).toHaveBeenCalledTimes(1);
  });

  test("a cancelled request does not emit a late segment", async () => {
    const io = transport(); const controller = new AbortController(); const onSegment = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onSegment, signal: controller.signal });
    const failure = request.catch((error) => error);
    await flush(); controller.abort(); await io.send(line(first, 0));
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onSegment).not.toHaveBeenCalled();
  });
});
