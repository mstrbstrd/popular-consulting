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
  for (let i = 1; i <= 7; i++) expect(player.enqueue("curious", "message", i)).toBe(true);
  expect(player.enqueue("curious", "message", 8)).toBe(false);
  player.cancel();
  jest.runAllTimers();
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("an authored chain finishes each beat before playing the next paragraph", () => {
  const { player, onPlay, onIdle } = setup();
  player.enqueue("support-and-reassure", "reply", 0);
  player.enqueue("warm", "reply", 1);
  expect(onPlay).toHaveBeenLastCalledWith("concerned", "reply", 0);
  jest.advanceTimersByTime(2320);
  expect(onPlay).toHaveBeenLastCalledWith("reassuring", "reply", 0);
  jest.advanceTimersByTime(1540);
  expect(onPlay).toHaveBeenLastCalledWith("warm", "reply", 1);
  jest.runAllTimers();
  expect(onPlay).toHaveBeenCalledTimes(3);
  expect(onIdle).toHaveBeenCalledTimes(1);
});

test("an over-capacity chain is rejected in full", () => {
  const { player, onPlay } = setup();
  for (let i = 0; i < 7; i++) player.enqueue("warm", "reply", i);
  expect(player.enqueue("support-and-reassure", "reply", 7)).toBe(false);
  jest.runAllTimers();
  expect(onPlay.mock.calls.map(([emote]) => emote)).toEqual(Array(7).fill("warm"));
});

test("reduced motion settles on a chain's final reaction without timers", () => {
  const { player, onPlay } = setup();
  player.enqueue("celebrate-and-appreciate", "reply", 0, true);
  expect(onPlay).toHaveBeenCalledWith("warm", "reply", 0);
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
