from pathlib import Path


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)


orb_path = Path("src/components/OrbSection.js")
orb = orb_path.read_text()

orb = replace_once(
    orb,
    '''const cloneMessage = ({ role, content, actionChain = [], source }) => ({
  role,
  content,
  actionChain: cloneActionChain(actionChain),
  source,
});

const OrbSection = ({ isActive = true }) => {''',
    '''const cloneMessage = ({ role, content, actionChain = [], source }) => ({
  role,
  content,
  actionChain: cloneActionChain(actionChain),
  source,
});

const extractCorrelatedResponse = (detail) => {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }

  const requestId =
    typeof detail.requestId === "string" ? detail.requestId.trim() : "";
  if (!requestId) return null;

  if (Object.prototype.hasOwnProperty.call(detail, "payload")) {
    return { requestId, payload: detail.payload };
  }

  if (
    Object.prototype.hasOwnProperty.call(detail, "response") &&
    Object.prototype.hasOwnProperty.call(detail, "actionChain")
  ) {
    return {
      requestId,
      payload: {
        response: detail.response,
        actionChain: detail.actionChain,
      },
    };
  }

  return null;
};

const OrbSection = ({ isActive = true }) => {''',
    "correlated response extractor",
)

orb = replace_once(
    orb,
    '''  const previewTimerRef = React.useRef(0);
  const requestTokenRef = React.useRef(0);
  const messageCounterRef = React.useRef(0);''',
    '''  const previewTimerRef = React.useRef(0);
  const requestTokenRef = React.useRef(0);
  const activeRequestRef = React.useRef(null);
  const messageCounterRef = React.useRef(0);''',
    "active request ref",
)

orb = replace_once(
    orb,
    '''    clearSequence();
    requestTokenRef.current += 1;
    window.clearTimeout(previewTimerRef.current);''',
    '''    clearSequence();
    requestTokenRef.current += 1;
    activeRequestRef.current = null;
    window.clearTimeout(previewTimerRef.current);''',
    "reset active request cleanup",
)

orb = replace_once(
    orb,
    '''  const receiveModelResponse = React.useCallback(
    (payload) => {
      requestTokenRef.current += 1;
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      return applyModelResponse(payload, "external");
    },
    [applyModelResponse],
  );''',
    '''  const receiveModelResponse = React.useCallback(
    (payload, options = {}) => {
      const expectedRequestId =
        options && typeof options === "object" ? options.requestId : null;
      const source =
        options &&
        typeof options === "object" &&
        typeof options.source === "string"
          ? options.source
          : "external";
      const activeRequest = activeRequestRef.current;

      if (
        expectedRequestId &&
        (!activeRequest || activeRequest.requestId !== expectedRequestId)
      ) {
        return false;
      }

      requestTokenRef.current += 1;
      activeRequestRef.current = null;
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      return applyModelResponse(payload, source);
    },
    [applyModelResponse],
  );''',
    "correlated response receiver",
)

orb = replace_once(
    orb,
    '''      const requestToken = requestTokenRef.current + 1;
      requestTokenRef.current = requestToken;

      setDraft("");''',
    '''      const requestToken = requestTokenRef.current + 1;
      const requestId = `metabloom-${requestToken}`;
      const activeRequest = {
        claimed: false,
        requestId,
        requestToken,
      };
      requestTokenRef.current = requestToken;
      activeRequestRef.current = activeRequest;

      setDraft("");''',
    "request identity creation",
)

orb = replace_once(
    orb,
    '''      window.dispatchEvent(
        new CustomEvent(MODEL_REQUEST_EVENT, {
          detail: {
            message: userMessage.content,
            history,
          },
        }),
      );

      if (requestTokenRef.current !== requestToken) return true;

      const requestAdapter = window.__metabloomRequest;''',
    '''      const claimRequest = () => {
        if (
          !mountedRef.current ||
          requestTokenRef.current !== requestToken ||
          activeRequestRef.current !== activeRequest
        ) {
          return false;
        }
        activeRequest.claimed = true;
        return true;
      };
      const respond = (payload) => {
        if (!claimRequest()) return false;
        return receiveModelResponse(payload, {
          requestId,
          source: "external",
        });
      };
      const requestEvent = new CustomEvent(MODEL_REQUEST_EVENT, {
        cancelable: true,
        detail: {
          requestId,
          message: userMessage.content,
          history,
          claim: claimRequest,
          respond,
        },
      });
      window.dispatchEvent(requestEvent);
      if (requestEvent.defaultPrevented) claimRequest();

      if (requestTokenRef.current !== requestToken) return true;

      const requestAdapter = window.__metabloomRequest;''',
    "claimable request event",
)

orb = replace_once(
    orb,
    '''          .then(() => requestAdapter({ message: userMessage.content, history }))
          .then((payload) => {''',
    '''          .then(() =>
            requestAdapter({
              requestId,
              message: userMessage.content,
              history,
            }),
          )
          .then((payload) => {''',
    "adapter request identity",
)

orb = replace_once(
    orb,
    '''            applyModelResponse(payload, "model");
          })''',
    '''            receiveModelResponse(payload, {
              requestId,
              source: "model",
            });
          })''',
    "adapter correlated completion",
)

orb = replace_once(
    orb,
    '''            setPending(false);
            setResponseSource("error");
            setErrorMessage(
              "No valid model response was received. Please try again.",
            );''',
    '''            activeRequestRef.current = null;
            requestTokenRef.current += 1;
            setPending(false);
            setResponseSource("error");
            setErrorMessage(
              "No valid model response was received. Please try again.",
            );''',
    "adapter rejection cleanup",
)

orb = replace_once(
    orb,
    '''        return true;
      }

      previewTimerRef.current = window.setTimeout(() => {''',
    '''        return true;
      }

      if (activeRequest.claimed) return true;

      previewTimerRef.current = window.setTimeout(() => {''',
    "claimed request preview suppression",
)

orb = replace_once(
    orb,
    '''        if (!mountedRef.current || requestTokenRef.current !== requestToken) {
          return;
        }
        applyModelResponse(createMetabloomPreviewResponse(message), "preview");''',
    '''        if (
          !mountedRef.current ||
          requestTokenRef.current !== requestToken ||
          activeRequestRef.current !== activeRequest
        ) {
          return;
        }
        receiveModelResponse(createMetabloomPreviewResponse(message), {
          requestId,
          source: "preview",
        });''',
    "preview correlation",
)

orb = replace_once(
    orb,
    '''    [appendMessage, applyModelResponse, pending, performAction],''',
    '''    [appendMessage, pending, performAction, receiveModelResponse],''',
    "send message dependencies",
)

orb = replace_once(
    orb,
    '''    const handleModelResponse = (event) => {
      receiveModelResponse(event.detail);
    };''',
    '''    const handleModelResponse = (event) => {
      const correlated = extractCorrelatedResponse(event.detail);
      if (!correlated) return;
      receiveModelResponse(correlated.payload, {
        requestId: correlated.requestId,
        source: "external",
      });
    };''',
    "correlated response event handler",
)

orb = replace_once(
    orb,
    '''      cancelSequenceTimer();
      requestTokenRef.current += 1;
      window.clearTimeout(previewTimerRef.current);''',
    '''      cancelSequenceTimer();
      requestTokenRef.current += 1;
      activeRequestRef.current = null;
      window.clearTimeout(previewTimerRef.current);''',
    "unmount active request cleanup",
)

orb_path.write_text(orb)


test_path = Path("src/components/OrbSection.test.js")
test = test_path.read_text()
old_event_test = '''  test("publishes user messages as events and accepts an event-driven response", () => {
    const onUserMessage = jest.fn();
    window.addEventListener("metabloom:user-message", onUserMessage);
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "What do you think?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onUserMessage).toHaveBeenCalledTimes(1);
    expect(onUserMessage.mock.calls[0][0].detail).toMatchObject({
      message: "What do you think?",
      history: expect.arrayContaining([
        { role: "user", content: "What do you think?" },
      ]),
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: modelResponse({ response: "An event supplied this response." }),
        }),
      );
    });

    expect(screen.getByText("An event supplied this response.")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/local interface preview shows/i))
      .not.toBeInTheDocument();

    window.removeEventListener("metabloom:user-message", onUserMessage);
  });
'''
new_event_tests = '''  test("lets an event responder claim a request and answer with correlation", () => {
    let requestDetail = null;
    const onUserMessage = jest.fn((event) => {
      requestDetail = event.detail;
      expect(event.cancelable).toBe(true);
      expect(event.detail.claim()).toBe(true);
    });
    window.addEventListener("metabloom:user-message", onUserMessage);
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "What do you think?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onUserMessage).toHaveBeenCalledTimes(1);
    expect(requestDetail).toMatchObject({
      requestId: expect.stringMatching(/^metabloom-\\d+$/),
      message: "What do you think?",
      history: expect.arrayContaining([
        { role: "user", content: "What do you think?" },
      ]),
      claim: expect.any(Function),
      respond: expect.any(Function),
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Preview response")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Metabloom is thinking")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: "metabloom-stale",
            ...modelResponse({ response: "A stale response." }),
          },
        }),
      );
    });
    expect(screen.queryByText("A stale response.")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: requestDetail.requestId,
            ...modelResponse({ response: "An event supplied this response." }),
          },
        }),
      );
    });

    expect(screen.getByText("An event supplied this response.")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/local interface preview shows/i))
      .not.toBeInTheDocument();

    window.removeEventListener("metabloom:user-message", onUserMessage);
  });

  test("ignores a late unclaimed event response after the preview wins", () => {
    let requestId = "";
    const onUserMessage = (event) => {
      requestId = event.detail.requestId;
    };
    window.addEventListener("metabloom:user-message", onUserMessage);
    render(<OrbSection isActive />);

    const input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Use the local preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    act(() => {
      jest.advanceTimersByTime(520);
    });
    expect(screen.getByText("Preview response")).toBeInTheDocument();
    const messagesAfterPreview = window.__orbMessages();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId,
            ...modelResponse({ response: "This response arrived too late." }),
          },
        }),
      );
    });

    expect(screen.queryByText("This response arrived too late."))
      .not.toBeInTheDocument();
    expect(window.__orbMessages()).toEqual(messagesAfterPreview);

    window.removeEventListener("metabloom:user-message", onUserMessage);
  });
'''
test = replace_once(
    test,
    old_event_test,
    new_event_tests,
    "event bridge behavior tests",
)

test = replace_once(
    test,
    '''      expect.objectContaining({
        message: "Use the model adapter",
        history: expect.arrayContaining([''',
    '''      expect.objectContaining({
        requestId: expect.stringMatching(/^metabloom-\\d+$/),
        message: "Use the model adapter",
        history: expect.arrayContaining([''',
    "adapter request identity assertion",
)

test_path.write_text(test)


docs_path = Path("docs/architecture/metabloom-chat-interface.md")
docs = docs_path.read_text()
old_event_docs = '''### Event bridge

Every submitted user message dispatches:

```text
metabloom:user-message
```

The event detail contains:

```json
{
  "message": "The newest user message",
  "history": [
    {
      "role": "assistant",
      "content": "Previous message"
    },
    {
      "role": "user",
      "content": "The newest user message"
    }
  ]
}
```

An external integration may respond by dispatching:

```js
window.dispatchEvent(
  new CustomEvent("metabloom:model-response", {
    detail: {
      response: "Validated model text",
      actionChain: [
        { action: "thinking", duration: 900, talking: false },
        { action: "agree", duration: 920, talking: true },
        { action: "reform", duration: 980, talking: false },
      ],
    },
  }),
);
```

A synchronous event response cancels the local preview before it can run.

'''
new_event_docs = '''### Event bridge

Every submitted user message dispatches a cancelable event:

```text
metabloom:user-message
```

Its detail contains `requestId`, `message`, bounded `history`, and two functions:

- `claim()` synchronously claims the request and suppresses the local preview.
- `respond(payload)` delivers a response only while that request is still current.

An asynchronous event integration must claim before awaiting network work:

```js
window.addEventListener("metabloom:user-message", async (event) => {
  const { requestId, message, history, claim } = event.detail;
  if (!claim()) return;

  const result = await fetch("/api/metabloom/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ message, history }),
  });
  const payload = await result.json();

  window.dispatchEvent(
    new CustomEvent("metabloom:model-response", {
      detail: {
        requestId,
        response: payload.response,
        actionChain: payload.actionChain,
      },
    }),
  );
});
```

Calling `event.preventDefault()` is also treated as a synchronous claim. A responder may use `event.detail.respond(payload)` instead of dispatching the response event. Correlated responses with stale or unknown request ids are ignored, and an observer that does not claim cannot append a second answer after the local preview wins.

The model payload itself still contains exactly `response` and `actionChain`; `requestId` belongs only to the browser transport envelope.

'''
docs = replace_once(
    docs,
    old_event_docs,
    new_event_docs,
    "event bridge documentation",
)

docs = replace_once(
    docs,
    '''- Only one model request is considered current. A newer response invalidates stale work.
- Pending preview timers and action timers are cleared during reset and unmount.''',
    '''- Only one model request is considered current. Every event response is correlated to that request id.
- Event integrations must claim synchronously before asynchronous work, so the local preview cannot race a connected responder.
- Pending preview timers and action timers are cleared during reset and unmount.''',
    "runtime correlation invariants",
)

docs_path.write_text(docs)
