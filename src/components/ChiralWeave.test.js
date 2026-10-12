import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorOSFieldCanvas, {
  normalizeChiralHandedness,
  normalizeChiralStructure,
  specializeCreatorOSFieldFragmentShader,
} from "./CreatorOSFieldCanvas";
import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";
import { CHIRAL_WEAVE_SHADER } from "./ChiralWeaveShader";

// Negative space: invalid orientation cannot collapse geometry; reflection cannot
// change clocks, seeds, renderer ownership, or the other eight scene identities.
describe("Chiral Weave boundaries", () => {
  afterEach(() => { cleanup(); jest.restoreAllMocks(); });

  test.each([0, 0.5, 2, -2, NaN, Infinity, null, undefined, "-1", {}])(
    "normalizes invalid handedness %p to the original orientation", (value) => {
      expect(normalizeChiralHandedness(value)).toBe(1);
    },
  );

  test.each([null, undefined, "DNA", "unknown", 1, NaN, {}, []])(
    "normalizes unsupported structure %p to classic", (value) => {
      expect(normalizeChiralStructure(value)).toBe("classic");
    },
  );

  test("DNA has a bounded independent branch with paired strands and molecular rings", () => {
    expect(normalizeChiralStructure("dna")).toBe("dna");
    expect(CHIRAL_WEAVE_SHADER).toContain("if (u_chiralStructure > 0.5) return sceneChiralDna(uv, time)");
    expect(CHIRAL_WEAVE_SHADER).toContain("molecule < 2");
    expect(CHIRAL_WEAVE_SHADER).toContain("strand < 2");
    expect(CHIRAL_WEAVE_SHADER).toContain("floor(p.y / spacing + 0.5)");
    expect(CHIRAL_WEAVE_SHADER).toContain("chiralDnaHexagon");
    expect(CHIRAL_WEAVE_SHADER).toContain("chiralDnaPentagon");
    expect(CHIRAL_WEAVE_SHADER).toContain("ringRadius * projection > pixel * 2.0");
  });

  test.each([1, -1])("reflection is an involution for %p", (value) => {
    const mirror = normalizeChiralHandedness(-value);
    expect(mirror).toBe(-value);
    expect(normalizeChiralHandedness(-mirror)).toBe(value);
  });

  test("specializes the ninth scene without changing its clock or seed", () => {
    const shader = specializeCreatorOSFieldFragmentShader(CREATOROS_FIELD_FRAGMENT_SHADER, 8);
    const start = shader.indexOf("vec4 sampleScene");
    expect(shader.slice(start, shader.indexOf("\n\nvoid main()", start)))
      .toContain("return sceneChiralWeave(uv, time)");
    expect(CHIRAL_WEAVE_SHADER).toContain("vec2(point.x * handedness, point.y)");
    expect(CHIRAL_WEAVE_SHADER).toContain("family < 2");
    expect(CHIRAL_WEAVE_SHADER).toContain("ribbon < 6");
    expect(CHIRAL_WEAVE_SHADER).toContain("family == 0 ? 1.0 : -1.0");
    expect(CHIRAL_WEAVE_SHADER).not.toMatch(/(?:time|clock|u_seed)\s*\*\s*handedness/);
    expect(CHIRAL_WEAVE_SHADER).not.toMatch(/sampler2D|texture\(|while\s*\(/);
  });

  test("fallback reflection retains the same single canvas and paused state", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container, rerender } = render(<CreatorOSFieldCanvas mode={8} paused />);
    const shell = container.querySelector(".creatoros-field-shell");
    const canvas = container.querySelector("canvas");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(shell).toHaveAttribute("data-chiral-handedness", "1");
    expect(shell).toHaveAttribute("data-chiral-structure", "classic");
    expect(shell).toHaveAttribute("data-reaction-runtime", "inactive");
    rerender(<CreatorOSFieldCanvas mode={8} paused chiralStructure="dna" chiralHandedness={-1} />);
    expect(shell).toHaveAttribute("data-chiral-structure", "dna");
    expect(shell).toHaveAttribute("data-reaction-runtime", "inactive");
    expect(container.querySelector("canvas")).toBe(canvas);
    rerender(<CreatorOSFieldCanvas mode={8} paused chiralHandedness={-1} />);
    expect(shell).toHaveAttribute("data-chiral-handedness", "-1");
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    rerender(<CreatorOSFieldCanvas mode={8} paused chiralHandedness={NaN} />);
    expect(shell).toHaveAttribute("data-chiral-handedness", "1");
  });
});
