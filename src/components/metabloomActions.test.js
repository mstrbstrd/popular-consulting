import {
  METABLOOM_ACTIONS,
  METABLOOM_ACTION_IDS,
  resolveMetabloomAction,
} from "./metabloomActions";

describe("Metabloom action language", () => {
  test("defines unique, bounded, complete action records", () => {
    expect(new Set(METABLOOM_ACTION_IDS).size).toBe(METABLOOM_ACTIONS.length);
    expect(METABLOOM_ACTIONS).toHaveLength(10);

    METABLOOM_ACTIONS.forEach((action) => {
      expect(action.id).toMatch(/^[a-z]+$/);
      expect(action.label).toBeTruthy();
      expect(action.intent).toBeTruthy();
      expect(action.motion).toBeTruthy();
      expect(action.colorway).toBeTruthy();
      expect(action.colors).toHaveLength(3);
      action.colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/i));
      expect(action.intensity).toBeGreaterThanOrEqual(0);
      expect(action.intensity).toBeLessThanOrEqual(1);
      expect(action.duration).toBeGreaterThanOrEqual(160);
      expect(action.duration).toBeLessThanOrEqual(8000);
    });
  });

  test("maps old form and mood names without accepting arbitrary values", () => {
    expect(resolveMetabloomAction("companion").id).toBe("reform");
    expect(resolveMetabloomAction("curious").id).toBe("thinking");
    expect(resolveMetabloomAction("grumpy").id).toBe("angry");
    expect(resolveMetabloomAction("not-real")).toBeNull();
    expect(resolveMetabloomAction({})).toBeNull();
  });
});
