const { getMetabloomExplicitAction } = require('./metabloomActionIntent');

test.each([
  "show me what you're made of", 'Can you show me what you are made of?',
  'Please show me what you’re made of!', 'show me under the hood',
  'show me your neural network animation please',
])('recognizes the explicit reveal command: %s', message => {
  expect(getMetabloomExplicitAction(message)).toBe('under-the-hood');
});

test.each([
  'deep dive on the top news of the day for me please', 'Do a deep dive on this topic',
  'Could you please deep research the latest news?', 'Please run a deep-dive on batteries',
])('recognizes the explicit research command: %s', message => {
  expect(getMetabloomExplicitAction(message)).toBe('deep-research');
});

test.each([
  'Search the web for news', 'What are you made of?', 'Show me what the bridge is made of',
  'Explain the phrase "show me what you are made of"', 'Do not show me your neural network',
  '"deep dive on the news"', 'Deep research has web access correct?',
  'Deep dive animation is broken', 'Do a deep dive using only the provided text',
  'Deep research this offline', 'Don’t do a deep dive', 'Hello', null,
])('leaves ordinary, quoted, declined and capability requests alone: %s', message => {
  expect(getMetabloomExplicitAction(message)).toBeNull();
});

test.each([
  'can you give me a top 5 news articles of the day for Canada?', "What's the latest news on the Ontario teachers strike?",
  'Top headlines today', 'news?', 'give me the news', "Summarize today's news", 'What are the top stories in Canada?',
  'catch me up on the news this morning',
])('presents a current news request as a research briefing: %s', message => {
  expect(getMetabloomExplicitAction(message)).toBe('deep-research');
});

test.each([
  'What is news?', 'Tell me about Fox News', 'Write a news article about our launch',
  'I saw on the news today that rates went up, why?', 'How did you miss the Nvidia news?',
  'What are the best news apps?', 'Show me the news without searching', "Draft a newsletter with today's headlines",
  'Is CBC a reliable news source?', 'how does the news affect markets today',
])('leaves writing, outlet questions, complaints and declined news requests alone: %s', message => {
  expect(getMetabloomExplicitAction(message)).toBeNull();
});
