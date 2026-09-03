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
    '''const PREVIEW_RESPONSE_DELAY_MS = 520;

const INITIAL_MESSAGES = Object.freeze([''',
    '''const PREVIEW_RESPONSE_DELAY_MS = 520;

let metabloomMountSequence = 0;

const createMetabloomMountId = () => {
  metabloomMountSequence += 1;
  const randomUUID =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : "";
  const uniquePart =
    randomUUID ||
    `${Date.now().toString(36)}-${metabloomMountSequence.toString(36)}`;
  return `metabloom-${uniquePart}`;
};

const INITIAL_MESSAGES = Object.freeze([''',
    "per-mount identity generator",
)

orb = replace_once(
    orb,
    '''  const sequenceTimerRef = React.useRef(0);
  const sequenceTokenRef = React.useRef(0);
  const previewTimerRef = React.useRef(0);''',
    '''  const sequenceTimerRef = React.useRef(0);
  const sequenceTokenRef = React.useRef(0);
  const mountIdRef = React.useRef("");
  if (!mountIdRef.current) mountIdRef.current = createMetabloomMountId();
  const previewTimerRef = React.useRef(0);''',
    "component mount identity",
)

orb = replace_once(
    orb,
    '''      const requestId = `metabloom-${requestToken}`;''',
    '''      const requestId = `${mountIdRef.current}-${requestToken}`;''',
    "request id mount scoping",
)

orb_path.write_text(orb)


test_path = Path("src/components/OrbSection.test.js")
test = test_path.read_text()

test = test.replace(
    'expect.stringMatching(/^metabloom-\\d+$/)',
    'expect.stringMatching(/^metabloom-[a-z0-9-]+-\\d+$/i)',
)
if 'expect.stringMatching(/^metabloom-\\d+$/)' in test:
    raise SystemExit("Legacy request-id matcher remained after replacement")

insertion_point = '''  test("uses an installed model adapter instead of the local preview", async () => {'''
new_test = '''  test("keeps request ids unique across component mounts", () => {
    const requestIds = [];
    const onUserMessage = (event) => {
      requestIds.push(event.detail.requestId);
      event.detail.claim();
    };
    window.addEventListener("metabloom:user-message", onUserMessage);

    const firstRender = render(<OrbSection isActive />);
    let input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "First mount" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    firstRender.unmount();

    render(<OrbSection isActive />);
    input = screen.getByRole("textbox", { name: "Message Metabloom" });
    fireEvent.change(input, { target: { value: "Second mount" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: requestIds[0],
            ...modelResponse({ response: "The old mount answered late." }),
          },
        }),
      );
    });
    expect(screen.queryByText("The old mount answered late."))
      .not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("metabloom:model-response", {
          detail: {
            requestId: requestIds[1],
            ...modelResponse({ response: "The current mount answered." }),
          },
        }),
      );
    });
    expect(screen.getByText("The current mount answered.")).toBeInTheDocument();

    window.removeEventListener("metabloom:user-message", onUserMessage);
  });

'''
test = replace_once(
    test,
    insertion_point,
    new_test + insertion_point,
    "cross-mount correlation test",
)

test_path.write_text(test)


docs_path = Path("docs/architecture/metabloom-chat-interface.md")
docs = docs_path.read_text()
docs = replace_once(
    docs,
    '''Correlated responses with stale or unknown request ids are ignored, and an observer that does not claim cannot append a second answer after the local preview wins.''',
    '''Correlated responses with stale or unknown request ids are ignored, and an observer that does not claim cannot append a second answer after the local preview wins. Request ids contain a unique component-mount identity, so a response created before leaving `/orb` cannot be accepted after the interface mounts again.''',
    "mount identity documentation",
)
docs = replace_once(
    docs,
    '''- Only one model request is considered current. Every event response is correlated to that request id.''',
    '''- Only one model request is considered current. Every event response is correlated to a request id that is unique to both the component mount and the request sequence.''',
    "mount-scoped runtime invariant",
)
docs_path.write_text(docs)
