from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


orb_path = root / "src/components/OrbSection.js"
orb = orb_path.read_text(encoding="utf-8")

orb = replace_once(
    orb,
    '''import {
  parseMetabloomEmoteEnvelope,
} from "./metabloomEmoteProtocol";''',
    '''import {
  createMetabloomSegmentStreamDecoder,
  parseMetabloomEmoteEnvelope,
} from "./metabloomEmoteProtocol";''',
    "stream decoder import",
)

orb = replace_once(
    orb,
    '''const cloneMessage = ({ role, content, actionChain = [], source, emote }) => ({
  emote,
  role,
  content,
  actionChain: cloneActionChain(actionChain),
  source,
});''',
    '''const cloneEmoteSegments = (segments = []) =>
  segments.map(({ emote, response }) => ({ emote, response }));

const contentFromEmoteSegments = (segments = []) =>
  segments.map(({ response }) => response).join("\\n\\n");

const cloneMessage = ({
  role,
  content,
  actionChain = [],
  source,
  emote,
  responseId,
  segments = [],
  streamState,
}) => ({
  emote,
  role,
  content,
  actionChain: cloneActionChain(actionChain),
  responseId,
  segments: cloneEmoteSegments(segments),
  source,
  streamState,
});''',
    "message clone helpers",
)

orb = replace_once(
    orb,
    '''  const requestAbortRef = React.useRef(null);
  const messageCounterRef = React.useRef(0);
  const mountedRef = React.useRef(true);''',
    '''  const requestAbortRef = React.useRef(null);
  const messageCounterRef = React.useRef(0);
  const responseMessageCounterRef = React.useRef(0);
  const mountedRef = React.useRef(true);''',
    "response message counter",
)

orb = replace_once(
    orb,
    '''  const conversationStarted = messages.length > 0 || pending;

  messagesRef.current = messages;''',
    '''  const conversationStarted = messages.length > 0 || pending;
  const hasStreamingAssistantMessage = messages.some(
    (message) =>
      message.role === "assistant" && message.streamState === "streaming",
  );

  messagesRef.current = messages;''',
    "streaming message state",
)

response_pattern = re.compile(
    r'''  const appendMessage = React\.useCallback\(
    \(role, content, actionChain = \[\], source = "interface", emote = null\) => \{.*?
  const applyModelResponse = React\.useCallback\(
    \(payload, source = "external", allowMultiple = false\) => \{.*?
  \);\n\n  const receiveModelResponse''',
    re.S,
)
response_match = response_pattern.search(orb)
if not response_match:
    raise RuntimeError("response assembly block was not found")
response_replacement = '''  const appendMessage = React.useCallback(
    (
      role,
      content,
      actionChain = [],
      source = "interface",
      emote = null,
      responseId = null,
      segments = [],
      streamState = null,
    ) => {
      messageCounterRef.current += 1;
      const normalizedSegments = cloneEmoteSegments(segments);
      const message = {
        id: `${role}-${messageCounterRef.current}`,
        role,
        content,
        emote,
        responseId,
        segments: normalizedSegments,
        streamState,
        actionChain: cloneActionChain(actionChain),
        source,
      };
      const nextMessages = [
        ...messagesRef.current.slice(-(MAX_CHAT_MESSAGES - 1)),
        message,
      ];
      messagesRef.current = nextMessages;
      updateStateSnapshot({
        conversationStarted: true,
        messageCount: nextMessages.length,
      });
      setMessages(nextMessages);
      return message;
    },
    [updateStateSnapshot],
  );

  const appendEmoteSegment = React.useCallback(
    (responseId, segment, source = "external") => {
      const parsed = parseMetabloomEmoteEnvelope(segment, {
        allowMultiple: false,
      });
      if (!parsed.ok || parsed.value.segments.length !== 1) return false;

      const normalized = parsed.value.segments[0];
      const currentMessages = messagesRef.current;
      const existingIndex = currentMessages.findIndex(
        (message) =>
          message.role === "assistant" && message.responseId === responseId,
      );
      let nextMessages;

      if (existingIndex >= 0) {
        const existing = currentMessages[existingIndex];
        const nextSegments = [
          ...cloneEmoteSegments(existing.segments),
          normalized,
        ];
        nextMessages = currentMessages.map((message, index) =>
          index === existingIndex
            ? {
                ...message,
                content: contentFromEmoteSegments(nextSegments),
                emote: normalized.emote,
                segments: nextSegments,
                source,
                streamState: "streaming",
              }
            : message,
        );
      } else {
        messageCounterRef.current += 1;
        const message = {
          id: `assistant-${messageCounterRef.current}`,
          role: "assistant",
          content: normalized.response,
          emote: normalized.emote,
          responseId,
          segments: [normalized],
          streamState: "streaming",
          actionChain: [],
          source,
        };
        nextMessages = [
          ...currentMessages.slice(-(MAX_CHAT_MESSAGES - 1)),
          message,
        ];
      }

      messagesRef.current = nextMessages;
      updateStateSnapshot({
        conversationStarted: true,
        messageCount: nextMessages.length,
      });
      setMessages(nextMessages);
      performEmote(normalized.emote);
      return true;
    },
    [performEmote, updateStateSnapshot],
  );

  const finishEmoteResponse = React.useCallback(
    (responseId, source = "external", streamState = "complete") => {
      const nextMessages = messagesRef.current.map((message) =>
        message.role === "assistant" && message.responseId === responseId
          ? { ...message, source, streamState }
          : message,
      );
      messagesRef.current = nextMessages;
      updateStateSnapshot({
        messageCount: nextMessages.length,
        pending: false,
        responseSource: source,
      });
      setMessages(nextMessages);
      setPending(false);
      setResponseSource(source);
      return true;
    },
    [updateStateSnapshot],
  );

  const playEmoteSegments = React.useCallback(
    (
      envelope,
      source = "external",
      {
        responseId = null,
        allowMultiple = true,
        delayBetweenSegments = true,
      } = {},
    ) => {
      const parsed = parseMetabloomEmoteEnvelope(envelope, { allowMultiple });
      if (!parsed.ok) return false;
      cancelResponseSegmentTimer();
      responseMessageCounterRef.current += 1;
      const resolvedResponseId =
        responseId ||
        `${mountIdRef.current}-response-${responseMessageCounterRef.current}`;
      const segments = parsed.value.segments;
      const token = responseSegmentTokenRef.current;
      let index = 0;

      const advance = () => {
        if (
          responseSegmentTokenRef.current !== token ||
          !mountedRef.current
        ) {
          return;
        }
        const segment = segments[index];
        if (!segment) {
          responseSegmentTimerRef.current = 0;
          finishEmoteResponse(resolvedResponseId, source);
          return;
        }
        appendEmoteSegment(resolvedResponseId, segment, source);
        index += 1;
        if (index >= segments.length) {
          responseSegmentTimerRef.current = 0;
          finishEmoteResponse(resolvedResponseId, source);
          return;
        }
        const readingDelay = delayBetweenSegments
          ? Math.min(3600, Math.max(1300, segment.response.length * 18))
          : 0;
        responseSegmentTimerRef.current = window.setTimeout(
          advance,
          readingDelay,
        );
      };

      advance();
      return true;
    },
    [
      appendEmoteSegment,
      cancelResponseSegmentTimer,
      finishEmoteResponse,
    ],
  );

  const createEmoteResponseStream = React.useCallback(
    ({
      allowMultiple = false,
      responseId = null,
      source = "external-stream",
    } = {}) => {
      cancelResponseSegmentTimer();
      responseMessageCounterRef.current += 1;
      const resolvedResponseId =
        responseId ||
        `${mountIdRef.current}-stream-${responseMessageCounterRef.current}`;
      let closed = false;
      let receivedSegments = 0;
      updateStateSnapshot({
        pending: true,
        responseSource: source,
      });
      setPending(true);
      setResponseSource(source);
      setErrorMessage("");

      const decoder = createMetabloomSegmentStreamDecoder({
        allowMultiple: allowMultiple === true,
        onSegment: (segment) => {
          if (closed || !mountedRef.current) return;
          if (appendEmoteSegment(resolvedResponseId, segment, source)) {
            receivedSegments += 1;
          }
        },
      });

      const fail = () => {
        closed = true;
        finishEmoteResponse(resolvedResponseId, source, "interrupted");
        setErrorMessage("The streamed response ended before it was complete.");
        return false;
      };

      return Object.freeze({
        responseId: resolvedResponseId,
        push(chunk) {
          if (closed || typeof chunk !== "string") return false;
          return decoder.push(chunk) || fail();
        },
        finish() {
          if (closed) return false;
          const result = decoder.finish();
          if (!result.ok || receivedSegments !== result.value.segments.length) {
            return fail();
          }
          closed = true;
          finishEmoteResponse(resolvedResponseId, source);
          return true;
        },
        cancel() {
          if (closed) return false;
          closed = true;
          finishEmoteResponse(resolvedResponseId, source, "interrupted");
          return true;
        },
        getState() {
          return {
            ...decoder.getState(),
            closed,
            receivedSegments,
            responseId: resolvedResponseId,
          };
        },
      });
    },
    [
      appendEmoteSegment,
      cancelResponseSegmentTimer,
      finishEmoteResponse,
      updateStateSnapshot,
    ],
  );

  const applyModelResponse = React.useCallback(
    (
      payload,
      source = "external",
      allowMultiple = false,
      responseId = null,
    ) => {
      cancelResponseSegmentTimer();
      const emoteResponse = parseMetabloomEmoteEnvelope(payload, {
        allowMultiple,
      });
      if (emoteResponse.ok) {
        updateStateSnapshot({ responseSource: source });
        setErrorMessage("");
        setResponseSource(source);
        return playEmoteSegments(emoteResponse.value, source, {
          allowMultiple,
          responseId,
        });
      }

      const parsed = parseMetabloomModelResponse(payload);
      if (!parsed.ok) {
        updateStateSnapshot({ pending: false });
        setPending(false);
        setErrorMessage(parsed.error);
        return false;
      }

      updateStateSnapshot({
        pending: false,
        responseSource: source,
      });
      setErrorMessage("");
      setPending(false);
      setResponseSource(source);
      appendMessage(
        "assistant",
        parsed.value.response,
        parsed.value.actionChain,
        source,
      );
      playSequence(parsed.value.actionChain, "legacy-model-response");
      return true;
    },
    [
      appendMessage,
      cancelResponseSegmentTimer,
      playEmoteSegments,
      playSequence,
      updateStateSnapshot,
    ],
  );

  const receiveModelResponse'''
orb = orb[: response_match.start()] + response_replacement + orb[response_match.end() :]

orb = replace_once(
    orb,
    '''      cancelResponse();
      return applyModelResponse(payload, source, allowMultiple);''',
    '''      cancelResponse();
      return applyModelResponse(
        payload,
        source,
        allowMultiple,
        expectedRequestId || options?.responseId || null,
      );''',
    "response identifier propagation",
)

orb = replace_once(
    orb,
    '''      const controller = new AbortController();
      requestAbortRef.current = controller;
      const request = { requestId, message: userMessage.content, history, signal: controller.signal };
      Promise.resolve().then(() => {
        if (!current() || controller.signal.aborted) return null;
        return typeof externalAdapter === "function" ? externalAdapter(request)
          : requestMetabloomResponse({ ...request, allowMultiple: false, optional: true });
      }).then((payload) => {
        if (!current()) return;
        if (!payload) { schedulePreviewResponse(); return; }
        receiveModelResponse(payload, { requestId, source: "model" });
      }).catch(() => {
        if (!current()) return;
        cancelResponse();
        updateStateSnapshot({ pending: false, responseSource: "error" });
        setPending(false);
        setResponseSource("error");
        setErrorMessage("The live model response was not completed. Try again or use a local demo.");
      });''',
    '''      const controller = new AbortController();
      requestAbortRef.current = controller;
      let streamedSegmentCount = 0;
      const request = {
        requestId,
        message: userMessage.content,
        history,
        signal: controller.signal,
      };
      const onSegment = (segment, index) => {
        if (!current() || index !== streamedSegmentCount) return;
        if (appendEmoteSegment(requestId, segment, "model")) {
          streamedSegmentCount += 1;
        }
      };
      Promise.resolve().then(() => {
        if (!current() || controller.signal.aborted) return null;
        return typeof externalAdapter === "function"
          ? externalAdapter({ ...request, onSegment })
          : requestMetabloomResponse({
              ...request,
              allowMultiple: activeRequest.allowMultiple,
              onSegment,
              optional: true,
            });
      }).then((payload) => {
        if (!current()) return;
        if (streamedSegmentCount > 0) {
          if (
            payload &&
            payload.segments?.length !== streamedSegmentCount
          ) {
            throw new Error("Stream completion did not match delivered segments.");
          }
          requestAbortRef.current = null;
          activeRequestRef.current = null;
          requestTokenRef.current += 1;
          finishEmoteResponse(requestId, "model");
          return;
        }
        if (!payload) {
          schedulePreviewResponse();
          return;
        }
        receiveModelResponse(payload, { requestId, source: "model" });
      }).catch(() => {
        if (!current()) return;
        if (streamedSegmentCount > 0) {
          finishEmoteResponse(requestId, "model", "interrupted");
        }
        cancelResponse();
        updateStateSnapshot({ pending: false, responseSource: "error" });
        setPending(false);
        setResponseSource("error");
        setErrorMessage("The live model response was not completed. Try again or use a local demo.");
      });''',
    "incremental API segment delivery",
)

orb = replace_once(
    orb,
    '''    [appendMessage, cancelResponse, clearSequence, receiveModelResponse, updateStateSnapshot],
  );''',
    '''    [
      appendEmoteSegment,
      appendMessage,
      cancelResponse,
      clearSequence,
      finishEmoteResponse,
      receiveModelResponse,
      updateStateSnapshot,
    ],
  );''',
    "send callback dependencies",
)

orb = replace_once(
    orb,
    '''      schema: cloneSchema(METABLOOM_EMOTE_RESPONSE_SCHEMA),
      respond: receiveModelResponse,
      getState,
    });''',
    '''      schema: cloneSchema(METABLOOM_EMOTE_RESPONSE_SCHEMA),
      createStream: createEmoteResponseStream,
      respond: receiveModelResponse,
      getState,
    });''',
    "public stream sink",
)

orb = replace_once(
    orb,
    '''    cancelResponse,
    cancelSequenceTimer,
    getMessages,''',
    '''    cancelResponse,
    cancelSequenceTimer,
    createEmoteResponseStream,
    getMessages,''',
    "stream sink effect dependency",
)

orb = replace_once(
    orb,
    '''              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`metabloom-chat__message metabloom-chat__message--${message.role}`}
                  aria-label={`${message.role === "assistant" ? "Metabloom" : "You"} message`}
                  data-emote={message.emote || undefined}
                >
                  <span className="metabloom-chat__speaker">
                    {message.role === "assistant" ? "Metabloom" : "You"}
                    {message.emote && ` · ${resolveMetabloomEmote(message.emote)?.label}`}
                  </span>
                  <div className="metabloom-chat__bubble">
                    <p>{message.content}</p>
                    {message.source === "preview" && (
                      <span className="metabloom-chat__preview-label">
                        Preview response
                      </span>
                    )}
                  </div>
                </article>
              ))}''',
    '''              {messages.map((message) => {
                const responseSegments =
                  message.role === "assistant" && message.segments?.length
                    ? message.segments
                    : null;
                const emoteSummary = responseSegments
                  ? responseSegments
                      .map(
                        (segment) =>
                          resolveMetabloomEmote(segment.emote)?.label,
                      )
                      .filter(Boolean)
                      .join(" → ")
                  : message.emote
                    ? resolveMetabloomEmote(message.emote)?.label
                    : "";

                return (
                  <article
                    key={message.id}
                    className={`metabloom-chat__message metabloom-chat__message--${message.role}`}
                    aria-label={`${message.role === "assistant" ? "Metabloom" : "You"} message`}
                    data-emote={message.emote || undefined}
                    data-response-id={message.responseId || undefined}
                    data-segment-count={responseSegments?.length || undefined}
                    data-stream-state={message.streamState || undefined}
                  >
                    <span className="metabloom-chat__speaker">
                      {message.role === "assistant" ? "Metabloom" : "You"}
                      {emoteSummary && ` · ${emoteSummary}`}
                    </span>
                    <div
                      className={`metabloom-chat__bubble${
                        responseSegments?.length > 1
                          ? " metabloom-chat__bubble--segmented"
                          : ""
                      }`}
                    >
                      {responseSegments ? (
                        responseSegments.map((segment, index) => (
                          <p
                            key={`${message.id}-segment-${index}`}
                            className="metabloom-chat__response-segment"
                            data-emote={segment.emote}
                          >
                            {segment.response}
                          </p>
                        ))
                      ) : (
                        <p>{message.content}</p>
                      )}
                      {message.source === "preview" && (
                        <span className="metabloom-chat__preview-label">
                          Preview response
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}''',
    "segmented single-message rendering",
)

orb = replace_once(
    orb,
    '''              {pending && (
                <article''',
    '''              {pending && !hasStreamingAssistantMessage && (
                <article''',
    "stream-aware pending indicator",
)

orb_path.write_text(orb, encoding="utf-8")

css_path = root / "src/components/OrbEmoteDemos.css"
css = css_path.read_text(encoding="utf-8")
if "metabloom-stream-caret" in css:
    raise RuntimeError("stream message styles already exist")
css += '''

/* A multi-emote stream remains one conversational message. */
.orb-page .metabloom-chat__bubble--segmented {
  display: grid;
  gap: 1.15rem;
}

.orb-page .metabloom-chat__response-segment {
  margin: 0;
}

.orb-page
  .metabloom-chat__response-segment
  + .metabloom-chat__response-segment {
  padding-top: 1.15rem;
  border-top: 1px solid
    color-mix(in srgb, var(--aetheris-line-strong) 62%, transparent);
}

.orb-page
  .metabloom-chat__message[data-stream-state="streaming"]
  .metabloom-chat__response-segment:last-of-type::after {
  content: "";
  display: inline-block;
  width: 0.42em;
  height: 0.9em;
  margin-left: 0.32em;
  border-radius: var(--aetheris-radius-pill);
  background: var(--aetheris-spectral);
  vertical-align: -0.08em;
  animation: metabloom-stream-caret 1.1s ease-in-out infinite;
}

@keyframes metabloom-stream-caret {
  0%,
  100% {
    opacity: 0.28;
  }
  50% {
    opacity: 0.9;
  }
}

@media (prefers-reduced-motion: reduce) {
  .orb-page
    .metabloom-chat__message[data-stream-state="streaming"]
    .metabloom-chat__response-segment:last-of-type::after {
    animation: none;
    opacity: 0.7;
  }
}

@media (forced-colors: active) {
  .orb-page
    .metabloom-chat__response-segment
    + .metabloom-chat__response-segment {
    border-top-color: CanvasText;
  }

  .orb-page
    .metabloom-chat__message[data-stream-state="streaming"]
    .metabloom-chat__response-segment:last-of-type::after {
    background: CanvasText;
  }
}
'''
css_path.write_text(css, encoding="utf-8")

architecture_path = root / "docs/architecture/metabloom-emote-protocol.md"
architecture = architecture_path.read_text(encoding="utf-8")
architecture = replace_once(
    architecture,
    "The provider adapter currently validates a complete structured envelope before framing it as NDJSON. This is not token-level upstream streaming. The decoder supports arbitrarily divided text chunks, but the UI waits for validated completion and presents complete segments with bounded reading time. One segment and its emote are presented together. The two-part demo deliberately exercises this presentation boundary, not an animation playlist.",
    "The transport is newline-delimited JSON. The browser validates and applies each complete segment as soon as that record arrives. All segments from one response share one assistant message in the transcript, so later segments append as paragraphs inside the existing bubble while the avatar adopts each segment's emote. The provider adapter currently validates a complete structured envelope before framing it as NDJSON, so this is segment streaming rather than a claim of token-level upstream streaming. The public `window.__metabloomProtocol.createStream({ allowMultiple: true })` sink accepts arbitrarily divided text chunks for future agent integrations. The two-part demo uses the same single-message segment presentation boundary, not an animation playlist.",
    "architecture streaming description",
)
architecture_path.write_text(architecture, encoding="utf-8")

local_test_path = root / "docs/examples/metabloom-local-test.md"
local_test = local_test_path.read_text(encoding="utf-8")
local_test = replace_once(
    local_test,
    "Open `/orb`. The landing controls are **Show me a whimsical response**, **Give me a reflective response**, **Offer a reassuring response**, and **Demo a two-part emotional stream**. They are always local, cost nothing at the provider, and work without an API key. After sending a message, expand **Local emote demos** above the composer to replay them. Assistant messages show the selected semantic emote beside Metabloom's name.",
    "Open `/orb`. The landing controls are **Show me a whimsical response**, **Give me a reflective response**, **Offer a reassuring response**, and **Demo a two-part emotional stream**. They are always local, cost nothing at the provider, and work without an API key. The two-part demo keeps both segments inside one assistant bubble and appends the reflective paragraph after the whimsical paragraph. After sending a message, expand **Local emote demos** above the composer to replay them. Assistant messages show the ordered emotes beside Metabloom's name.",
    "local test streaming description",
)
local_test_path.write_text(local_test, encoding="utf-8")

verifier_path = root / "scripts/verify-metabloom-browser.mjs"
verifier = verifier_path.read_text(encoding="utf-8")
verifier = replace_once(
    verifier,
    '''    const before = await evaluate("window.__orbMessages().length");
    await evaluate(`(() => { const d = document.querySelector('.metabloom-chat__demos'); d.open=true; Array.from(d.querySelectorAll('button')).find(b => b.textContent.includes('two-part')).click(); d.open=false; })()`);
    await until(`window.__orbMessages().length === ${before + 3} && window.__orbState().emote === 'reflective'`);
    const state = await evaluate(`({state:window.__orbState(), tail:window.__orbMessages().slice(-2), calls:window.__demoNetworkCalls})`);
    assert.deepEqual(state.tail.map((item) => item.emote), ["whimsy", "reflective"]);
    assert.equal(state.calls, 0, "Demos must never call the provider");
    results.push({ viewport: config.id, theme: expectedTheme, reducedMotion: config.reduced, demoEmotes: ["whimsy", "reflective", "reassuring"], stream: state.tail.map((item) => item.emote), networkCalls: state.calls, geometry });''',
    '''    const before = await evaluate("window.__orbMessages().length");
    await evaluate(`(() => { const d = document.querySelector('.metabloom-chat__demos'); d.open=true; Array.from(d.querySelectorAll('button')).find(b => b.textContent.includes('two-part')).click(); d.open=false; })()`);
    await until(`window.__orbMessages().length === ${before + 2} && window.__orbState().emote === 'reflective' && !window.__orbState().pending`);
    const state = await evaluate(`(() => {
      const message = window.__orbMessages().at(-1);
      const article = document.querySelector('[data-segment-count="2"]');
      return {
        state: window.__orbState(),
        message,
        articleCount: document.querySelectorAll('[data-segment-count="2"]').length,
        paragraphCount: article?.querySelectorAll('.metabloom-chat__response-segment').length || 0,
        calls: window.__demoNetworkCalls,
      };
    })()`);
    assert.equal(state.message.role, "assistant");
    assert.deepEqual(state.message.segments.map((item) => item.emote), ["whimsy", "reflective"]);
    assert.equal(state.articleCount, 1, "A multi-segment response must remain one UI message");
    assert.equal(state.paragraphCount, 2, "Both streamed segments must render in one bubble");
    assert.equal(state.calls, 0, "Demos must never call the provider");
    results.push({ viewport: config.id, theme: expectedTheme, reducedMotion: config.reduced, demoEmotes: ["whimsy", "reflective", "reassuring"], stream: state.message.segments.map((item) => item.emote), singleMessage: state.articleCount === 1, networkCalls: state.calls, geometry });''',
    "browser verification",
)
verifier_path.write_text(verifier, encoding="utf-8")

integration_path = root / "src/components/MetabloomEmoteIntegration.test.js"
integration = integration_path.read_text(encoding="utf-8")
integration = replace_once(
    integration,
    '''    act(() => { expect(window.__metabloomProtocol.respond(payload, { allowMultiple: true })).toBe(true); });
    act(() => jest.advanceTimersByTime(7000));
    expect(window.__orbMessages().map((item) => item.emote)).toEqual(["whimsy", "reflective"]);
  });''',
    '''    act(() => { expect(window.__metabloomProtocol.respond(payload, { allowMultiple: true })).toBe(true); });
    act(() => jest.advanceTimersByTime(7000));
    expect(window.__orbMessages()).toHaveLength(1);
    expect(window.__orbMessages()[0].segments.map((item) => item.emote)).toEqual([
      "whimsy",
      "reflective",
    ]);
  });''',
    "direct multi-segment integration expectation",
)
integration = replace_once(
    integration,
    '''  test("finishes the two-part demo with one different emote on each message", () => {
    render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Demo a two-part emotional stream" }));
    act(() => jest.advanceTimersByTime(520));
    act(() => jest.advanceTimersByTime(7000));
    expect(window.__orbMessages().filter((item) => item.role === "assistant").map((item) => item.emote)).toEqual(["whimsy", "reflective"]);
    expect(mockProps.actionVersion).toBe(2);
    expect(window.__orbState().sequenceId).toBeNull();
  });''',
    '''  test("streams two emotes into one assistant message", () => {
    render(<OrbSection />);
    fireEvent.click(screen.getByRole("button", { name: "Demo a two-part emotional stream" }));
    act(() => jest.advanceTimersByTime(520));
    let assistantMessages = window.__orbMessages().filter(
      (item) => item.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].segments.map((item) => item.emote)).toEqual([
      "whimsy",
    ]);

    act(() => jest.advanceTimersByTime(7000));
    assistantMessages = window.__orbMessages().filter(
      (item) => item.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].segments.map((item) => item.emote)).toEqual([
      "whimsy",
      "reflective",
    ]);
    expect(screen.getAllByLabelText("Metabloom message")).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-segment-count="2"]'),
    ).toHaveLength(1);
    expect(mockProps.actionVersion).toBe(2);
    expect(window.__orbState().sequenceId).toBeNull();
  });

  test("accepts arbitrarily chunked NDJSON into one streamed message", () => {
    render(<OrbSection />);
    let stream;
    act(() => {
      stream = window.__metabloomProtocol.createStream({
        allowMultiple: true,
        source: "test-stream",
      });
    });
    const first =
      '{"type":"segment","index":0,"emote":"whimsy","response":"A playful start."}\\n';
    const second =
      '{"type":"segment","index":1,"emote":"reflective","response":"A considered finish."}\\n';
    const done = '{"type":"done","version":"1.0.0"}\\n';

    act(() => {
      expect(stream.push(first.slice(0, 31))).toBe(true);
      expect(stream.push(first.slice(31) + second.slice(0, 17))).toBe(true);
    });
    expect(window.__orbMessages()).toHaveLength(1);
    expect(window.__orbMessages()[0].segments).toEqual([
      { emote: "whimsy", response: "A playful start." },
    ]);

    act(() => {
      expect(stream.push(second.slice(17) + done)).toBe(true);
      expect(stream.finish()).toBe(true);
    });
    const messages = window.__orbMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].streamState).toBe("complete");
    expect(messages[0].segments).toEqual([
      { emote: "whimsy", response: "A playful start." },
      { emote: "reflective", response: "A considered finish." },
    ]);
    expect(screen.getAllByLabelText("Metabloom message")).toHaveLength(1);
  });''',
    "single-message demo tests",
)
integration_path.write_text(integration, encoding="utf-8")

client_test_path = root / "src/components/metabloomApiClient.test.js"
client_test = client_test_path.read_text(encoding="utf-8")
marker = "\n});\n"
insert_at = client_test.rfind(marker)
if insert_at < 0:
    raise RuntimeError("API client test suite terminator was not found")
progressive_test = '''

  test("delivers complete NDJSON segments before the stream finishes", async () => {
    const encode = (value) =>
      Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0)));
    let releaseDone;
    let markSecondReadStarted;
    const secondReadStarted = new Promise((resolve) => {
      markSecondReadStarted = resolve;
    });
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encode(
            '{"type":"segment","index":0,"emote":"whimsy","response":"First."}\\n',
          ),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseDone = () =>
                resolve({
                  done: false,
                  value: encode('{"type":"done","version":"1.0.0"}\\n'),
                });
              markSecondReadStarted();
            }),
        )
        .mockResolvedValueOnce({ done: true }),
      cancel: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn(),
    };
    const onSegment = jest.fn();
    const request = requestMetabloomResponse({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: headers("application/x-ndjson"),
        body: { getReader: () => reader },
      }),
      message: "Stream this",
      onSegment,
    });

    await secondReadStarted;
    expect(onSegment).toHaveBeenCalledWith(
      { emote: "whimsy", response: "First." },
      0,
    );

    releaseDone();
    await expect(request).resolves.toEqual({
      version: "1.0.0",
      segments: [{ emote: "whimsy", response: "First." }],
    });
  });'''
client_test = client_test[:insert_at] + progressive_test + client_test[insert_at:]
client_test_path.write_text(client_test, encoding="utf-8")

export_workflow = root / ".github/workflows/export-metabloom-stream-source.yml"
if export_workflow.exists():
    export_workflow.unlink()

required = {
    "stream API": "createEmoteResponseStream" in orb,
    "single message rendering": "data-segment-count" in orb,
    "incremental callback": "onSegment," in orb,
    "browser invariant": "A multi-segment response must remain one UI message" in verifier,
    "temporary export removed": not export_workflow.exists(),
}
failed = [name for name, passed in required.items() if not passed]
if failed:
    raise RuntimeError("Missing required changes: " + ", ".join(failed))
