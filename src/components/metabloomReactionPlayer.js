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
      if (!resolveMetabloomEmote(emote)) return false;
      // Neutral is an intentional settle. Reduced motion never builds a backlog.
      if (emote === "neutral" || reducedMotion) {
        cancel();
        onPlay(emote, messageId, index);
        onIdle();
        return true;
      }
      if (queue.length >= 4) return false;
      queue.push({ emote, messageId, index });
      if (!timer) advance();
      return true;
    },
  };
};
