import { classifyMetabloomVisualIntent, extractMetabloomVisualData } from './metabloomVisualIntent';

const user = content => ({ role: 'user', content });
const assistant = content => ({ role: 'assistant', content });
const mapHistory = [user('Show me a map of Kelowna BC.'),
  assistant('I created a map, heatmap and route dashboard. All three are displayed.')];
const chartRequest = 'Create a line chart of monthly revenue: Revenue: 10, 20, 30.';
const chartHistory = [user(chartRequest), assistant('The chart is displayed. Say yes or next to create another.')];

test.each([
  ['Create a pie chart representing apple pie ingredients.', 'pie-chart'],
  ['Make a bar chart of map sales: January 10, February 20.', 'bar-chart'],
  ['Show a line graph of monthly sales.', 'line-chart'],
  ['Create a flowchart that maps our checkout steps.', 'flowchart'],
  ['Make a table comparing map projections.', 'table'],
  ['Create an interactive project-price calculator with Hours and Hourly Rate.', 'calculator'],
  ['Make a flowchart of how to export a PDF file.', 'flowchart'],
  ['Make a bar chart of image export costs.', 'bar-chart'],
  ['Explain the data, and then show a bar chart: Sales: 10, 20.', 'bar-chart'],
])('a supported requested format stays authoritative: %s', (message, kind) => {
  expect(classifyMetabloomVisualIntent(message)).toMatchObject({ mode: 'requested', preferredKinds: [kind], requiredKind: kind });
});

test.each([
  'What else can you do with gen ui?',
  'What kind of UI can you create?',
  'What types of interactive components can you make?',
  'Which charts are supported?',
  'List your supported visualizations.',
])('capability questions use the capability contract: %s', message => {
  expect(classifyMetabloomVisualIntent(message)).toEqual({ mode: 'capabilities', preferredKinds: [], dataHints: null });
});

test.each([
  ['Show me a map of Kelowna BC.', 'map'],
  ['Create an interactive map with a table of attractions.', 'map'],
  ['Make a table and an interactive map.', 'map'],
  ['Make a table, then show me a map.', 'map'],
  ['Create a dashboard with a calculator and bar chart.', 'dashboard'],
  ['Create a custom UI with a table.', 'custom-ui'],
  ['Create a web app with a calculator.', 'custom-ui'],
  ['Show me a scatter plot with a table.', 'unsupported-chart'],
  ['Make a stacked bar chart.', 'unsupported-chart'],
  ['Create an image of a pie chart.', 'image'],
  ['Create an animated bar chart.', 'animation'],
  ['Create a simulation of traffic.', 'animation'],
  ['Export the chart as a PNG file.', 'export'],
  ['Can you export PNGs?', 'export'],
  ['Make a chart and export it as PNG.', 'export'],
])('an unsupported primary or additional format is never downgraded: %s', (message, unsupportedKind) => {
  expect(classifyMetabloomVisualIntent(message)).toEqual({ mode: 'unsupported', preferredKinds: [], dataHints: null, unsupportedKind });
});

test.each([
  'Explain Array.map in JavaScript.',
  'What is a map projection?',
  'Write JavaScript code for a map of Kelowna.',
  'Show me a React component for a map.',
  'Create HTML for an interactive map and table.',
  'What else can you do?',
  'Show me a trick.',
  'What’s under the hood?',
  'Show me your Orb animations.',
  'Show your Orb reactions.',
])('ordinary knowledge, source-code and Orb-scene requests stay ordinary: %s', message => {
  expect(classifyMetabloomVisualIntent(message).mode).toBe('optional');
});

test.each(['Text only: create a map.', 'I want only text, no visuals.', 'Create a table without gen UI.'])('text-only overrides requested visuals: %s', message => {
  expect(classifyMetabloomVisualIntent(message, mapHistory)).toEqual({ mode: 'text_only', preferredKinds: [], dataHints: null });
});

test('generic UI requests require a choice of an implemented component', () => {
  expect(classifyMetabloomVisualIntent('Could you build me an interactive UI for this?').mode).toBe('clarification');
  expect(classifyMetabloomVisualIntent('Build a calculator but do not output HTML or code.')).toMatchObject({ mode: 'requested', requiredKind: 'calculator' });
});

test('the complete reported map conversation remains honest with the app’s bounded history', () => {
  const turns = [
    ['what else can you do with gen ui?', 'Maps, exports, dashboards and charts are supported.', 'capabilities'],
    ['can you show me a map of kelowna bc?', 'Which format would you like?', 'unsupported'],
    ["i shouldn't have to, just pick yourself please", 'I will make a PNG.', 'unsupported'],
    ["let's do all three one at a time", 'I will produce all three.', 'unsupported'],
    ['i want it visible in the gen ui', 'Done. I am displaying the PNG.', 'unsupported'],
    ['lets go', 'Done. Leaflet loaded.', 'unsupported'],
    ['nope', 'The choropleth is loading.', 'visual_status'],
    ["i don't see any of that", '', 'visual_status'],
  ];
  let history = [];
  for (const [message, reply, mode] of turns) {
    const result = classifyMetabloomVisualIntent(message, history);
    expect(result).toMatchObject({ mode, preferredKinds: [], dataHints: null });
    if (mode !== 'capabilities') expect(result.unsupportedKind).toBe('map');
    expect(result.resolvedMessage).toBeUndefined();
    history = [...history, user(message), assistant(reply)].slice(-12);
  }
});

test.each(['just pick yourself', 'all three one at a time', 'i want it visible in gen ui', 'lets go'])('a map followup never inherits invented assistant tools: %s', message => {
  expect(classifyMetabloomVisualIntent(message, mapHistory)).toEqual({ mode: 'unsupported', preferredKinds: [], dataHints: null, unsupportedKind: 'map', followup: true });
});

test.each(['nope', 'I don’t see any of that', 'Where is it?'])('a missing-map report preserves the unsupported kind without claiming display: %s', message => {
  expect(classifyMetabloomVisualIntent(message, mapHistory)).toEqual({ mode: 'visual_status', preferredKinds: [], dataHints: null, unsupportedKind: 'map', followup: true });
});

test.each(['yes', 'next', 'lets go', 'just pick yourself', 'all three one at a time'])('generic confirmation cannot restart a completed chart: %s', message => {
  expect(classifyMetabloomVisualIntent(message, chartHistory)).toEqual({ mode: 'clarification', preferredKinds: [], dataHints: null, followup: true });
});

test.each(['Render that line chart again.', 'Recreate it.', 'i want it visible in the gen ui'])('explicit supported repeats resolve only prior user data: %s', message => {
  expect(classifyMetabloomVisualIntent(message, chartHistory)).toMatchObject({ mode: 'requested', preferredKinds: ['line-chart'],
    requiredKind: 'line-chart', resolvedMessage: chartRequest, followup: true, dataHints: extractMetabloomVisualData(chartRequest) });
});

test('an explicit new format overrides a different prior topic', () => {
  expect(classifyMetabloomVisualIntent('Show this map of Kelowna.', chartHistory)).toMatchObject({ mode: 'unsupported', unsupportedKind: 'map' });
  expect(classifyMetabloomVisualIntent('Create this bar chart: A 1, B 2.', mapHistory)).toMatchObject({ mode: 'requested', requiredKind: 'bar-chart' });
  expect(classifyMetabloomVisualIntent('Render that scatter plot again.', chartHistory)).toMatchObject({ mode: 'unsupported', unsupportedKind: 'unsupported-chart' });
});

test('an unrelated user topic and explicit code or text-only turns stop old visual history', () => {
  for (const topic of ['Tell me how to bake bread.', 'Write JavaScript code for a map.', 'Only text please.']) {
    const history = [...mapHistory, user(topic), assistant('The map is displayed. Say yes to continue.')];
    expect(classifyMetabloomVisualIntent('lets go', history).mode).toBe('optional');
    expect(classifyMetabloomVisualIntent('Where is it?', history).mode).toBe('optional');
    expect(classifyMetabloomVisualIntent('What else can you do?', history).mode).toBe('optional');
  }
});

test('assistant text alone cannot authorize a chart, resolve task data, or establish map support', () => {
  const history = [user('Hello.'), assistant('You asked for a bar chart of Revenue: 999, 999. I am displaying it. Maps work too.')];
  expect(classifyMetabloomVisualIntent('lets go', history).mode).toBe('optional');
  expect(classifyMetabloomVisualIntent('Render that bar chart again.', history)).toEqual({ mode: 'clarification', preferredKinds: [], dataHints: null, followup: true });
  expect(classifyMetabloomVisualIntent('Show me a map of Kelowna.', history).mode).toBe('unsupported');
});

test('history resolution is bounded and never truncates task data to force a repeat', () => {
  const outsideWindow = [...mapHistory, ...Array.from({ length: 12 }, () => assistant('Maps are supported.'))];
  expect(classifyMetabloomVisualIntent('lets go', outsideWindow).mode).toBe('optional');
  expect(classifyMetabloomVisualIntent('Recreate it.', [user('Create a table. ' + 'a'.repeat(1600))]).mode).toBe('clarification');
  expect(classifyMetabloomVisualIntent('lets go', [user('Create a map. ' + 'a'.repeat(8000))]).mode).toBe('optional');
  expect(classifyMetabloomVisualIntent('lets go', null).mode).toBe('optional');
});
