const baseUrl = (process.env.METABLOOM_BASE_URL || "http://localhost:3000")
  .replace(/\/$/, "");
const message = process.env.METABLOOM_TEST_MESSAGE
  || "Explain why a small emotional vocabulary can make an interface feel more trustworthy.";

const response = await fetch(`${baseUrl}/api/metabloom`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    allowMultiple: false,
    history: [],
    message,
    requestId: `smoke-${Date.now()}`,
  }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Metabloom API returned ${response.status}: ${body}`);
}

const contentType = response.headers.get("content-type") || "";
if (!contentType.includes("application/x-ndjson")) {
  throw new Error(`Expected NDJSON but received ${contentType || "no content type"}.`);
}

const lines = (await response.text())
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const segments = lines.filter((event) => event.type === "segment");
const done = lines.at(-1);
if (
  segments.length !== 1
  || !segments[0].emote
  || !segments[0].response
  || done?.type !== "done"
) {
  throw new Error(`Unexpected Metabloom stream: ${JSON.stringify(lines)}`);
}

console.log(JSON.stringify({
  emote: segments[0].emote,
  response: segments[0].response,
  version: done.version,
}, null, 2));
