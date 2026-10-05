import { createMetabloomReactionPlayer } from "./metabloomReactionPlayer";

afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const setup = () => {
  jest.useFakeTimers();
  const onPlay = jest.fn();
  const onIdle = jest.fn();
  return { player: createMetabloomReactionPlayer({ onPlay, onIdle }), onPlay, onIdle };
};

test("invalid reactions cannot disturb a valid queue", () => {
  const { player, onPlay } = setup();
  player.enqueue("warm", "message", 0);
  player.enqueue("curious", "message", 1);
  expect(player.enqueue("constructor", "message", 2)).toBe(false);
  jest.advanceTimersByTime(1840);
  expect(onPlay.mock.calls.map(([emote]) => emote)).toEqual(["warm", "curious"]);
});

test.each(["neutral", "reduced"])("%s cancels queued playback immediately", (mode) => {
  const { player, onPlay } = setup();
  player.enqueue("warm", "message", 0);
  player.enqueue("curious", "message", 1);
  player.enqueue(mode === "neutral" ? "neutral" : "relieved", "message", 2, mode === "reduced");
  jest.runAllTimers();
  expect(onPlay.mock.calls.map(([emote]) => emote)).toEqual(["warm", mode === "neutral" ? "neutral" : "relieved"]);
  expect(jest.getTimerCount()).toBe(0);
});

test("the backlog stays bounded and cancellation removes every timer", () => {
  const { player, onPlay } = setup();
  player.enqueue("warm", "message", 0);
  for (let i = 1; i <= 4; i++) expect(player.enqueue("curious", "message", i)).toBe(true);
  expect(player.enqueue("curious", "message", 5)).toBe(false);
  player.cancel();
  jest.runAllTimers();
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
