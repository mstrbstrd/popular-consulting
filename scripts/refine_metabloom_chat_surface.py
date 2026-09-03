from pathlib import Path


def replace_once(path, old, new, label):
    file_path = Path(path)
    content = file_path.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    file_path.write_text(content.replace(old, new, 1))


def replace_all(path, old, new, expected, label):
    file_path = Path(path)
    content = file_path.read_text()
    count = content.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    file_path.write_text(content.replace(old, new))


replace_once(
    "src/components/StandaloneExperiencePage.js",
    '    label: "Living Metabloom Lab",',
    '    label: "Metabloom",',
    "Orb route label",
)

standalone_test_path = Path("src/components/StandaloneExperiencePage.test.js")
standalone_test = standalone_test_path.read_text()
standalone_replacements = (
    (
        '      label: "Living Metabloom Lab",',
        '      label: "Metabloom",',
        "standalone config label",
    ),
    (
        '      screen.getByRole("main", { name: "Living Metabloom Lab" }),',
        '      screen.getByRole("main", { name: "Metabloom" }),',
        "standalone main label",
    ),
    (
        '      expect(document.title).toBe("Faceless Metabloom Avatar Lab | Popular Consulting");',
        '      expect(document.title).toBe("Metabloom Chat | Popular Consulting");',
        "standalone route title",
    ),
    (
        '  test("renders the Orb with one localized creature and no full-screen renderer", async () => {',
        '  test("renders the full-screen Metabloom chat without a second background renderer", async () => {',
        "standalone light test title",
    ),
    (
        '  test("keeps dark Orb mode on the same localized creature architecture", async () => {',
        '  test("keeps dark Orb mode on the same single-field architecture", async () => {',
        "standalone dark test title",
    ),
)
for old, new, label in standalone_replacements:
    count = standalone_test.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    standalone_test = standalone_test.replace(old, new, 1)
standalone_test_path.write_text(standalone_test)

orb_path = Path("src/components/OrbSection.js")
orb = orb_path.read_text()
source_block = '''  const sourceText =
    responseSource === "preview"
      ? "Local interface preview"
      : responseSource === "model" || responseSource === "external"
        ? "Model response"
        : responseSource === "error"
          ? "Response unavailable"
          : "Ready for model JSON";

'''
if orb.count(source_block) != 1:
    raise SystemExit("visible model source status block was not found exactly once")
orb = orb.replace(source_block, "", 1)

presence_old = '''            <span>{statusText}</span>
            <span aria-hidden="true">·</span>
            <span>{sourceText}</span>
'''
presence_new = '''            <span>Metabloom</span>
            <span aria-hidden="true">·</span>
            <span>{statusText}</span>
'''
if orb.count(presence_old) != 1:
    raise SystemExit("presence label block was not found exactly once")
orb = orb.replace(presence_old, presence_new, 1)

action_chain_block = '''                    {message.role === "assistant"
                      && message.actionChain.length > 0 && (
                        <div
                          className="metabloom-chat__action-chain"
                          aria-label={`Action chain: ${message.actionChain
                            .map((step) => step.action)
                            .join(", ")}`}
                        >
                          {message.actionChain.map((step, index) => (
                            <React.Fragment
                              key={`${message.id}-${step.action}-${index}`}
                            >
                              {index > 0 && <span aria-hidden="true">→</span>}
                              <span>{step.action}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
'''
if orb.count(action_chain_block) != 1:
    raise SystemExit("visible action chain block was not found exactly once")
orb = orb.replace(action_chain_block, "", 1)

if orb.count("Local contract preview") != 1:
    raise SystemExit("local preview label was not found exactly once")
orb = orb.replace("Local contract preview", "Preview response", 1)

composer_note_block = '''            <div className="metabloom-chat__composer-note">
              <span>
                Model output: <code>response</code> + <code>actionChain</code>
              </span>
              {draft.length > MAX_USER_MESSAGE_CHARS * 0.75 && (
                <span>
                  {draft.length}/{MAX_USER_MESSAGE_CHARS}
                </span>
              )}
            </div>
'''
if orb.count(composer_note_block) != 1:
    raise SystemExit("visible composer contract note was not found exactly once")
orb = orb.replace(composer_note_block, "", 1)
orb_path.write_text(orb)

css_path = Path("src/components/OrbSection.css")
css = css_path.read_text()
css_replacements = (
    (
        '''.metabloom-chat__shell {
  display: grid;
''',
        '''.metabloom-chat__shell {
  display: grid;
  min-width: 0;
''',
        "shell width invariant",
    ),
    (
        '''.metabloom-chat__messages {
  min-height: 0;
''',
        '''.metabloom-chat__messages {
  min-width: 0;
  min-height: 0;
''',
        "message scroller width invariant",
    ),
    (
        '''.metabloom-chat__message-list {
  display: flex;
''',
        '''.metabloom-chat__message-list {
  display: flex;
  min-width: 0;
''',
        "message list width invariant",
    ),
    (
        '''.metabloom-chat__message {
  display: flex;
''',
        '''.metabloom-chat__message {
  display: flex;
  min-width: 0;
''',
        "message width invariant",
    ),
    (
        '''.metabloom-chat__composer-area {
  display: grid;
''',
        '''.metabloom-chat__composer-area {
  display: grid;
  min-width: 0;
''',
        "composer area width invariant",
    ),
    (
        '''.metabloom-chat__composer {
  display: grid;
''',
        '''.metabloom-chat__composer {
  display: grid;
  width: 100%;
  min-width: 0;
  overflow: hidden;
''',
        "composer containment invariant",
    ),
    (
        '''.metabloom-chat__composer textarea {
  width: 100%;
''',
        '''.metabloom-chat__composer textarea {
  width: 100%;
  min-width: 0;
''',
        "composer textarea width invariant",
    ),
)
for old, new, label in css_replacements:
    count = css.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    css = css.replace(old, new, 1)

action_chain_css = '''.metabloom-chat__action-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--metabloom-chat-line);
  color: var(--metabloom-chat-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  font-weight: 650;
  letter-spacing: 0.045em;
  line-height: 1.3;
  text-transform: lowercase;
}

'''
if css.count(action_chain_css) != 1:
    raise SystemExit("action chain presentation CSS was not found exactly once")
css = css.replace(action_chain_css, "", 1)

composer_note_css = '''.metabloom-chat__composer-note {
  display: flex;
  min-height: 1.4rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1.1rem;
  color: var(--metabloom-chat-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.025em;
  line-height: 1.3;
}

.metabloom-chat__composer-note code {
  color: inherit;
  font: inherit;
  font-weight: 700;
}

'''
if css.count(composer_note_css) != 1:
    raise SystemExit("composer note CSS was not found exactly once")
css = css.replace(composer_note_css, "", 1)

mobile_note_css = '''
  .metabloom-chat__composer-note {
    display: none;
  }
'''
if css.count(mobile_note_css) != 1:
    raise SystemExit("mobile composer note CSS was not found exactly once")
css = css.replace(mobile_note_css, "", 1)
css_path.write_text(css)

orb_test_path = Path("src/components/OrbSection.test.js")
orb_test = orb_test_path.read_text()
if orb_test.count("Local contract preview") != 2:
    raise SystemExit("Orb preview test labels did not match the expected count")
orb_test = orb_test.replace("Local contract preview", "Preview response")
visible_chain_assertion = '''    expect(screen.getByLabelText(/Action chain: excited, happy, agree, reform/i))
      .toBeInTheDocument();
'''
if orb_test.count(visible_chain_assertion) != 1:
    raise SystemExit("visible action-chain test assertion was not found exactly once")
orb_test = orb_test.replace(visible_chain_assertion, "", 1)
message_expectation = '''        expect.objectContaining({
          role: "assistant",
          content: expect.stringMatching(/worth celebrating/i),
        }),
'''
message_replacement = '''        expect.objectContaining({
          role: "assistant",
          content: expect.stringMatching(/worth celebrating/i),
          actionChain: expect.arrayContaining([
            expect.objectContaining({ action: "excited" }),
            expect.objectContaining({ action: "reform" }),
          ]),
        }),
'''
if orb_test.count(message_expectation) != 1:
    raise SystemExit("assistant transcript expectation was not found exactly once")
orb_test = orb_test.replace(message_expectation, message_replacement, 1)
orb_test_path.write_text(orb_test)

runtime_test_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
runtime_test = runtime_test_path.read_text()
anchor = '''    expect(orb).not.toContain("<table>");
    expect(orb).not.toContain("orb-avatar-lab__stage");
'''
replacement = '''    expect(orb).not.toContain("<table>");
    expect(orb).not.toContain("orb-avatar-lab__stage");
    expect(orb).not.toContain("Ready for model JSON");
    expect(orb).not.toContain("Model output:");
    expect(orb).not.toContain("metabloom-chat__action-chain");
    expect(orb).not.toContain("metabloom-chat__composer-note");
'''
if runtime_test.count(anchor) != 1:
    raise SystemExit("runtime chat negative-space anchor was not found exactly once")
runtime_test = runtime_test.replace(anchor, replacement, 1)
runtime_test_path.write_text(runtime_test)

capture_path = Path("scripts/capture-orb-review.mjs")
capture = capture_path.read_text()
forbidden_anchor = '''    "orb-avatar-lab__table-wrap",
  ].forEach((forbiddenClass) => {
'''
forbidden_replacement = '''    "orb-avatar-lab__table-wrap",
    "metabloom-chat__action-chain",
    "metabloom-chat__composer-note",
    "Living Metabloom Lab",
    "Ready for model JSON",
    "Model output:",
  ].forEach((forbiddenClass) => {
'''
if capture.count(forbidden_anchor) != 1:
    raise SystemExit("visual negative-space list was not found exactly once")
capture = capture.replace(forbidden_anchor, forbidden_replacement, 1)
capture_path.write_text(capture)
