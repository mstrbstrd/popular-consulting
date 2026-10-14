import { resolveBlackHoleBatchSize } from "./blackHoleFramePump";

describe("black-hole frame-pump evidence scheduling", () => {
  test("keeps the authored batch size outside evidence capture", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "",
        scheduledTilesPerBatch: 16,
        remainingTiles: 12,
      }),
    ).toBe(12);
  });

  test("yields after one tile during strict dark evidence", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "?visual-runtime-evidence=dark",
        scheduledTilesPerBatch: 16,
        remainingTiles: 16,
      }),
    ).toBe(1);
  });

  test("uses the canonical evidence-request normalization", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "?visual-runtime-evidence=%20DARK%20",
        scheduledTilesPerBatch: 16,
        remainingTiles: 16,
      }),
    ).toBe(1);
  });

  test("does not alter unrelated evidence modes", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "?visual-runtime-evidence=light",
        scheduledTilesPerBatch: 4,
        remainingTiles: 9,
      }),
    ).toBe(4);
  });

  test("never exceeds the remaining tile count", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "",
        scheduledTilesPerBatch: 8,
        remainingTiles: 2,
      }),
    ).toBe(2);
  });

  test.each([
    { mobile: true, popcanDrawing: false, expected: 4 },
    { mobile: true, popcanDrawing: true, expected: 2 },
    { mobile: false, popcanDrawing: false, expected: 8 },
    { mobile: false, popcanDrawing: true, expected: 4 },
  ])("caps Popcan GPU tiles without ever pausing the renderer: %p", ({
    mobile, popcanDrawing, expected,
  }) => {
    expect(resolveBlackHoleBatchSize({
      scheduledTilesPerBatch: 16,
      remainingTiles: 16,
      popcanActive: true,
      popcanDrawing,
      mobile,
    })).toBe(expected);
    expect(resolveBlackHoleBatchSize({
      scheduledTilesPerBatch: 1,
      remainingTiles: 16,
      popcanActive: true,
      popcanDrawing,
      mobile,
    })).toBe(1);
    expect(resolveBlackHoleBatchSize({
      scheduledTilesPerBatch: 16,
      remainingTiles: 1,
      popcanActive: true,
      popcanDrawing,
      mobile,
    })).toBe(1);
  });

  test("Popcan gesture status has no effect on other routes or strict evidence", () => {
    expect(resolveBlackHoleBatchSize({
      scheduledTilesPerBatch: 16,
      remainingTiles: 16,
      popcanDrawing: true,
      mobile: true,
    })).toBe(16);
    expect(resolveBlackHoleBatchSize({
      search: "?visual-runtime-evidence=dark",
      scheduledTilesPerBatch: 16,
      remainingTiles: 16,
      popcanActive: true,
      popcanDrawing: true,
      mobile: false,
    })).toBe(1);
  });
});
