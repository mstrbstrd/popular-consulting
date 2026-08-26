import { isSoftwareRenderer } from "./visualRuntimeGpuEvidence";

describe("visual runtime virtual renderer rejection", () => {
  test("rejects the Apple Paravirtual identity exposed by hosted macOS", () => {
    expect(
      isSoftwareRenderer(
        "ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)",
        "Google Inc. (Apple)",
      ),
    ).toBe(true);
  });

  test("rejects generic virtual GPU identities", () => {
    expect(isSoftwareRenderer("Virtio-GPU", "Mesa")).toBe(true);
    expect(
      isSoftwareRenderer("ANGLE Virtual GPU", "Virtual device"),
    ).toBe(true);
  });

  test("keeps physical Apple Silicon eligible for measurement", () => {
    expect(
      isSoftwareRenderer("Apple M3 Pro", "Apple Inc."),
    ).toBe(false);
  });
});
