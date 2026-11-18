const { METABLOOM_PRICE_BOOK_GUIDE, getMetabloomPriceBookGuidanceResponse: explain } = require('./metabloomPriceBookGuidance');
const { buildMetabloomVisualCapabilityPrompt } = require('./metabloomVisualCapabilities');
const { classifyMetabloomVisualIntent } = require('./metabloomVisualIntent');
const { parseMetabloomChatEnvelope } = require('./metabloomEmoteProtocol');

test.each([
  'you can do rates for me and my business right?',
  'Can you help with my business pricing?',
  'What do you need to set up a price book?',
  'Tell me about price books.',
  'How does a pricebook work?',
  'What can you do with price books?',
  'Can you build price books?',
  "What's a price book?",
])('returns the same setup guide without requesting a render: %s', message => {
  expect(explain(message, [], { enabled: true })).toBe(METABLOOM_PRICE_BOOK_GUIDE);
  expect(classifyMetabloomVisualIntent(message).mode).toBe('capabilities');
});

test('the explanation covers the full intake, review and quoting workflow within the chat contract', () => {
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('Currency: CAD or USD');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('minimum billable time');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('per started block');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('one way or round trip');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('Premiums and fees');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('Minimum job charge');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('include or exclude tax');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('your explicit Publish click');
  expect(METABLOOM_PRICE_BOOK_GUIDE).toContain('After publishing, estimates need only the job facts');
  for (const enabled of [true, false]) {
    const text = explain('Explain price books.', [], { enabled });
    expect(parseMetabloomChatEnvelope({ version: '2.0.0', segments: [{ response: text }] }, { allowMultiple: false }).ok).toBe(true);
  }
});

test('an immediate walkthrough follows the user topic but intake and unrelated topics stay with the agent', () => {
  const history = [{ role: 'user', content: 'Can you do rates for my business?' },
    { role: 'assistant', content: METABLOOM_PRICE_BOOK_GUIDE }];
  expect(explain('ok, walk me through what you need please', history, { enabled: true })).toBe(METABLOOM_PRICE_BOOK_GUIDE);
  for (const previous of ['My price book is CAD 65/hour.', 'We are in BC.', 'Tell me about neural networks.']) {
    expect(explain('What do you need from me?', [...history, { role: 'user', content: previous }], { enabled: true })).toBeNull();
  }
  expect(explain('How does it work?', [{ role: 'assistant', content: 'You can publish a price book.' }])).toBeNull();
});

test.each([
  'Create a price book in CAD at 65 per hour.',
  'Can you build my price book using the rates above?',
  'Can you help with my price book at sixty-five dollars per hour?',
  'Can you help with my price book using my rates?',
  'Quote a three-hour job using my price book.',
  'Publish my price book.',
  'Change my price book to USD.',
  'Explain price books and then search for the news.',
  'Write code for a price book.',
  'What are the latest business rates?',
  'Can you compare price books?',
  'What are interest rates?',
  'My tax rate is five percent.',
  'Try again.',
  'Translate "tell me about price books".',
])('does not replace actual work or another topic with setup copy: %s', message => {
  expect(explain(message, [], { enabled: true })).toBeNull();
});

test('the effective model instructions use the same guide and respect feature availability', () => {
  const prompt = buildMetabloomVisualCapabilityPrompt({ visualMode: 'optional', toolset: true, priceBookEnabled: true });
  expect(prompt).toContain(METABLOOM_PRICE_BOOK_GUIDE);
  expect(prompt).toContain('ask only for unresolved rules');
  expect(buildMetabloomVisualCapabilityPrompt({ priceBookEnabled: false })).not.toContain(METABLOOM_PRICE_BOOK_GUIDE);
  expect(explain('Tell me about price books.')).toMatch(/^Price-book drafting and quoting are unavailable/);
});
