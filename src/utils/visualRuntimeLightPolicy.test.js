import {
  initVisualRuntimeLightPolicy,
  readVisualRuntimeLightCaptureRequest,
  readVisualRuntimePipelineRequest,
  resolveVisualRuntimeLightPolicy,
  VISUAL_RUNTIME_LIGHT_PIPELINE_ID,
} from "./visualRuntimeLightPolicy";

const activeShell = Object.freeze({ active: true });
const inactiveShell = Object.freeze({ active: false });

describe("optimized light pipeline policy", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute(
      "data-visual-runtime-light-pipeline",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-light-disabled",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-light-capture",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-light-capture-id",
    );
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    jest.restoreAllMocks();
  });

  test("remains off without an explicit light request", () => {
    expect(readVisualRuntimePipelineRequest("")).toBeNull();
    expect(
      resolveVisualRuntimeLightPolicy({
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

  test("requires both the light request and active shell", () => {
    expect(
      resolveVisualRuntimeLightPolicy({
        search: "?visual-runtime-pipeline=light",
        shellPolicy: inactiveShell,
      }),
    ).toMatchObject({
      requested: VISUAL_RUNTIME_LIGHT_PIPELINE_ID,
      active: false,
      disabledReason: "optimized-shell-required",
    });

    expect(
      resolveVisualRuntimeLightPolicy({
        search: "?visual-runtime-pipeline=light",
        shellPolicy: activeShell,
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: VISUAL_RUNTIME_LIGHT_PIPELINE_ID,
      active: true,
      captureRequested: false,
      captureState: null,
      disabledReason: null,
    });
  });

  test("builds a pinned light capture without activating the reference harness", () => {
    const search =
      "?visual-runtime-pipeline=light" +
      "&visual-runtime-light-capture=1" +
      "&capture-id=light-about" +
      "&capture-section=1" +
      "&capture-time=8" +
      "&capture-reveal=1";

    expect(readVisualRuntimeLightCaptureRequest(search)).toBe(true);
    const policy = resolveVisualRuntimeLightPolicy({
      search,
      shellPolicy: activeShell,
    });

    expect(policy).toMatchObject({
      active: true,
      captureRequested: true,
      disabledReason: null,
      captureState: {
        active: true,
        captureId: "light-about",
        section: 1,
        timeSeconds: 8,
        reveal: 1,
      },
    });
  });

  test("rejects unsupported optimized pipelines and dark light captures", () => {
    expect(
      resolveVisualRuntimeLightPolicy({
        search: "?visual-runtime-pipeline=dark",
        shellPolicy: activeShell,
      }),
    ).toMatchObject({
      requested: "dark",
      active: false,
      disabledReason: "unsupported-optimized-pipeline",
    });

    expect(
      resolveVisualRuntimeLightPolicy({
        search:
          "?visual-runtime-pipeline=light" +
          "&visual-runtime-light-capture=1" +
          "&capture-theme=dark",
        shellPolicy: activeShell,
      }),
    ).toMatchObject({
      active: false,
      disabledReason: "light-capture-theme-required",
    });
  });

  test("pins capture theme and navigates through the existing section dots", () => {
    document.body.innerHTML = `
      <button class="section-dot active"></button>
      <button class="section-dot"></button>
    `;
    const dots = document.querySelectorAll(".section-dot");
    dots[1].click = jest.fn();
    window.localStorage.setItem("popcon-theme", "dark");
    jest.spyOn(window, "setTimeout").mockImplementation((callback) => {
      callback();
      return 1;
    });

    const policy = resolveVisualRuntimeLightPolicy({
      search:
        "?visual-runtime-pipeline=light" +
        "&visual-runtime-light-capture=1" +
        "&capture-id=light-about" +
        "&capture-section=1" +
        "&capture-theme=light",
      shellPolicy: activeShell,
    });
    const cleanup = initVisualRuntimeLightPolicy({ policy });

    expect(window.localStorage.getItem("popcon-theme")).toBe("light");
    expect(window.location.hash).toBe("#section-1");
    expect(dots[1].click).toHaveBeenCalledTimes(1);
    expect(document.documentElement).toHaveAttribute(
      "data-visual-runtime-light-capture",
      "true",
    );

    cleanup();
    expect(window.localStorage.getItem("popcon-theme")).toBe("dark");
  });
});
