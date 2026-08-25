import {
  initVisualRuntimeDarkPolicy,
  readVisualRuntimeDarkCaptureRequest,
  readVisualRuntimeDarkPipelineRequest,
  resolveVisualRuntimeDarkPolicy,
  VISUAL_RUNTIME_DARK_PIPELINE_ID,
} from "./visualRuntimeDarkPolicy";

const activeShell = Object.freeze({ active: true });
const inactiveShell = Object.freeze({ active: false });

describe("optimized dark pipeline policy", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute(
      "data-visual-runtime-dark-pipeline",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-dark-disabled",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-dark-capture",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-dark-capture-id",
    );
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    jest.restoreAllMocks();
  });

  test("remains off without an explicit dark request", () => {
    expect(readVisualRuntimeDarkPipelineRequest("")).toBeNull();
    expect(
      resolveVisualRuntimeDarkPolicy({
        search: "",
        shellPolicy: activeShell,
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: null,
      active: false,
      captureRequested: false,
      captureState: null,
      disabledReason: null,
    });
  });

  test("requires the dark request and active one-context shell", () => {
    expect(
      resolveVisualRuntimeDarkPolicy({
        search: "?visual-runtime-pipeline=dark",
        shellPolicy: inactiveShell,
      }),
    ).toMatchObject({
      requested: VISUAL_RUNTIME_DARK_PIPELINE_ID,
      active: false,
      disabledReason: "optimized-shell-required",
    });

    expect(
      resolveVisualRuntimeDarkPolicy({
        search: "?visual-runtime-pipeline=dark",
        shellPolicy: activeShell,
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: VISUAL_RUNTIME_DARK_PIPELINE_ID,
      active: true,
      captureRequested: false,
      captureState: null,
      disabledReason: null,
    });
  });

  test("builds a pinned dark capture without enabling the reference harness", () => {
    const search =
      "?visual-runtime-pipeline=dark" +
      "&visual-runtime-dark-capture=1" +
      "&capture-theme=dark" +
      "&capture-id=dark-about" +
      "&capture-section=1" +
      "&capture-time=8" +
      "&capture-black-hole-zoom=28";

    expect(readVisualRuntimeDarkCaptureRequest(search)).toBe(true);
    const policy = resolveVisualRuntimeDarkPolicy({
      search,
      shellPolicy: activeShell,
    });

    expect(policy).toMatchObject({
      active: true,
      captureRequested: true,
      disabledReason: null,
      captureState: {
        active: true,
        captureId: "dark-about",
        theme: "dark",
        section: 1,
        timeSeconds: 8,
        blackHoleZoom: 28,
      },
    });
  });

  test("rejects unsupported pipelines and non-dark dark captures", () => {
    expect(
      resolveVisualRuntimeDarkPolicy({
        search: "?visual-runtime-pipeline=light",
        shellPolicy: activeShell,
      }),
    ).toMatchObject({
      requested: "light",
      active: false,
      disabledReason: "unsupported-optimized-pipeline",
    });

    expect(
      resolveVisualRuntimeDarkPolicy({
        search:
          "?visual-runtime-pipeline=dark" +
          "&visual-runtime-dark-capture=1" +
          "&capture-theme=light",
        shellPolicy: activeShell,
      }),
    ).toMatchObject({
      active: false,
      disabledReason: "dark-capture-theme-required",
    });
  });

  test("pins dark theme and navigates through the existing section dots", () => {
    document.body.innerHTML = `
      <button class="section-dot active"></button>
      <button class="section-dot"></button>
    `;
    const dots = document.querySelectorAll(".section-dot");
    dots[1].click = jest.fn();
    window.localStorage.setItem("popcon-theme", "light");
    jest.spyOn(window, "setTimeout").mockImplementation((callback) => {
      callback();
      return 1;
    });

    const policy = resolveVisualRuntimeDarkPolicy({
      search:
        "?visual-runtime-pipeline=dark" +
        "&visual-runtime-dark-capture=1" +
        "&capture-theme=dark" +
        "&capture-id=dark-about" +
        "&capture-section=1",
      shellPolicy: activeShell,
    });
    const cleanup = initVisualRuntimeDarkPolicy({ policy });

    expect(window.localStorage.getItem("popcon-theme")).toBe("dark");
    expect(window.location.hash).toBe("#section-1");
    expect(dots[1].click).toHaveBeenCalledTimes(1);
    expect(document.documentElement).toHaveAttribute(
      "data-visual-runtime-dark-capture",
      "true",
    );

    cleanup();
    expect(window.localStorage.getItem("popcon-theme")).toBe("light");
  });
});
