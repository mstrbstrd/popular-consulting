const { resolveMetabloomEmote } = require("./metabloomEmoteLibrary");

// Text arrives immediately. Body language gets one complete, bounded beat at a time.
export const createMetabloomReactionPlayer = ({ onPlay, onIdle }) => {
  let timer = 0;
  let queue = [];
  let generation = 0;
  const cancel = () => {
    generation += 1;
    clearTimeout(timer);
    timer = 0;
    queue = [];
  };
  const advance = () => {
    timer = 0;
    const next = queue.shift();
    if (!next) { onIdle(); return; }
    const token = generation;
    onPlay(next.emote, next.messageId, next.index);
    timer = setTimeout(() => {
      if (token === generation) advance();
    }, resolveMetabloomEmote(next.emote).duration);
  };
  return {
    cancel,
    enqueue(emote, messageId, index, reducedMotion = false) {
      const choice = resolveMetabloomEmote(emote);
      if (!choice) return false;
      const steps = choice.steps || [emote];
      // Neutral is an intentional settle. Reduced motion never builds a backlog.
      if (emote === "neutral" || reducedMotion) {
        cancel();
        onPlay(reducedMotion ? steps[steps.length - 1] : emote, messageId, index);
        onIdle();
        return true;
      }
      // Four response paragraphs can select a two-step recipe each.
      // Admission is atomic, so an over-capacity recipe never partially plays.
      if (queue.length + steps.length + (timer ? 1 : 0) > 8) return false;
      queue.push(...steps.map((step) => ({ emote: step, messageId, index })));
      if (!timer) advance();
      return true;
    },
  };
};
