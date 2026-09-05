import fs from "fs";
import path from "path";

describe("Metabloom reduced-motion neutrality", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "CreatorOSFieldCanvas.js"),
    "utf8",
  );

  test("settle and reform resolve to the neutral terminal pose", () => {
    const actionPhaseBlock = source.match(
      /const\s+actionPhase\s*=([\s\S]*?);/,
    );
    expect(actionPhaseBlock).not.toBeNull();
    expect(actionPhaseBlock[1]).toContain('actionId === "reform"');
    expect(actionPhaseBlock[1]).toMatch(
      /actionId\s*===\s*"reform"\s*\?\s*1/,
    );
  });
});
