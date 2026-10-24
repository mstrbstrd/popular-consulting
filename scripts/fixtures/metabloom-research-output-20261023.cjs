// Minimized regression evidence from the user's 2026-10-23 pasted Orb result.
// These are report paraphrases, not newly retrieved original-source quotations.
// Date-bearing sentences, Unicode U+2011 hyphens, and Markdown-before-[ID]
// citation layout are preserved. Canonical titles were not included in the paste;
// the source labels below deliberately identify only the visible host and ID.
const question = "can you give me the top 5 news events of the day so far today? a deep dive please";
const asOf = "2026-10-23T20:39:00.000Z";
const timeZone = "America/Vancouver";
const observedTitle = "Top five news developments (snapshot) — 2026-10-23";
const observedScope = "Concise evidence‑based briefing summarizing five major developments reported in the supplied research notes and canonical sources during the window 2026-10-23 (items drawn from the supplied sources).";
const observedLimitations = [
  "This brief is limited to the items, text excerpts and source identifiers supplied in the report.notes and report.sources. I did not access the underlying websites or add material beyond those supplied citations.",
  "The supplied notes paraphrase and attribute development dates, but do not include verbatim quoted excerpts from the cited source documents that contain explicit publication or event dates. Because the required exact date excerpts were not provided in the source material, I set developmentDate and dateEvidence null and used dateBasis = \"unknown\" for each item to avoid inventing or misattributing quotes.",
  "Source published dates and verbatim article date excerpts were not supplied in the evidence package; publishedDate entries in sourceDetails are therefore null and dateEvidence fields are empty.",
  "This selection reflects the researcher's view of top items from the supplied evidence and is not a comprehensive, real‑time feed of all events on 2026-10-23."
];
const sections = [
  {
    "headline": "U.S. Defense Production Act action on petroleum/refining",
    "summary": "The White House and Energy Department moved to use the Defense Production Act (DPA) to restart/expand U.S. refinery and petroleum logistics capacity — a major domestic energy‑policy intervention intended to relieve supply/refining bottlenecks and affect oil/prices. This is high‑consequence for energy markets, industry planning, and U.S. strategic energy resilience.",
    "datedLine": "- Development date & evidence (compact): Development dated 2026‑10‑22 — “Presidential Determination … on Domestic Petroleum Production, Refining, and Logistics Capacity” signaled DPA use to expand refining/logistics. ([whitehouse.gov](https://www.whitehouse.gov/presidential-actions/2026/10/presidential-determination-pursuant-to-section-303-of-the-defense-production-act-of-1950-as-amended-on-domestic-petroleum-production-refining-and-logistics-capacity-c139/?utm_source=openai)) [1]",
    "supportingLine": "- Original publication / supporting excerpt: The Energy Department posted a DPA plan on 2026‑10‑22 describing up to $150 million in Title III funding to restart/refine capacity and logistics. ([energy.gov](https://www.energy.gov/articles/energy-department-use-defense-production-act-funding-restart-american-refinery-and-expand?utm_source=openai)) [2]",
    "developmentDate": "2026-10-22",
    "reportExcerpt": "Development dated 2026‑10‑22 — “Presidential Determination … on Domestic Petroleum Production, Refining, and Logistics Capacity” signaled DPA use to expand refining/logistics.",
    "background": "The Energy Department posted a DPA plan on 2026‑10‑22 describing up to $150 million in Title III funding to restart/refine capacity and logistics.",
    "sourceIds": [
      1,
      2
    ],
    "whyItMatters": "DPA authority can speed funding/capacity changes that affect near‑term fuel supply and prices, and signals administration focus on near‑term energy security ahead of elections and during regional disruptions. Watch for refinery restart timelines, which facilities get funding, and market reactions (fuel futures, refiners’ statements)."
  },
  {
    "headline": "Magnitude‑7.0 earthquake in Nagqu, Tibet",
    "summary": "A powerful earthquake struck the Nagqu area of the Tibet Autonomous Region, killing and injuring residents and collapsing homes in remote, high‑altitude communities — a major humanitarian event requiring search & rescue and relief logistics. International relief and regional aftershock risk make this globally notable.",
    "datedLine": "- Development date & evidence (compact): Development dated 2026‑10‑22 — USGS records the M7.0 event (event page and technical detail). ([earthquake.usgs.gov](https://earthquake.usgs.gov/earthquakes/eventpage/us6000u43g/?utm_source=openai)) [3]",
    "supportingLine": "- Original publication / supporting excerpt: AP and other outlets reporting on 2026‑10‑23 describe at least 16 killed, dozens injured and hundreds of homes collapsed following the Oct. 22 temblor in Nagqu. ([apnews.com](https://apnews.com/article/0358c57cfcbc0de48d2486df15ded4ef?utm_source=openai)) [4]",
    "developmentDate": "2026-10-22",
    "reportExcerpt": "Development dated 2026‑10‑22 — USGS records the M7.0 event (event page and technical detail).",
    "background": "AP and other outlets reporting on 2026‑10‑23 describe at least 16 killed, dozens injured and hundreds of homes collapsed following the Oct. 22 temblor in Nagqu.",
    "sourceIds": [
      3,
      4
    ],
    "whyItMatters": "Rescue and relief access in very high‑altitude, sparsely populated regions is complex; aftershocks and infrastructure damage could cause additional casualties and regional disruption. Watch official Chinese emergency updates, international offers of aid, and USGS/CENC updates about aftershocks and intensity mapping."
  },
  {
    "headline": "Pentagon grants DHS approval to test Active Denial System (the “heat ray”)",
    "summary": "Reporting (memo obtained / reported by major outlets) says Defense Secretary Pete Hegseth approved a temporary loan of one Active Denial System (ADS) unit to the Department of Homeland Security for testing and tactics development — a notable step toward possible deployment of directed‑energy crowd‑control technology at the southern border. This raises legal, ethical and operational debates.",
    "datedLine": "- Development date & evidence (compact): Development reported 2026‑10‑21 — coverage states Hegseth signed a memo authorizing a seven‑month loan of the Active Denial System to DHS for testing/tactics. ([axios.com](https://www.axios.com/2026/10/21/heat-ray-border-immigration-hegseth?utm_source=openai)) [5]",
    "supportingLine": "- Original publication / supporting excerpt: Multiple outlets (Axios, Stars and Stripes, Daily Beast summarizing CNN’s reporting) describe the memo and that the loan excludes DoD personnel operating the system, placing operational responsibility with DHS. ([axios.com](https://www.axios.com/2026/10/21/heat-ray-border-immigration-hegseth?utm_source=openai)) [5]",
    "developmentDate": "2026-10-21",
    "reportExcerpt": "Development reported 2026‑10‑21 — coverage states Hegseth signed a memo authorizing a seven‑month loan of the Active Denial System to DHS for testing/tactics.",
    "background": "Multiple outlets (Axios, Stars and Stripes, Daily Beast summarizing CNN’s reporting) describe the memo and that the loan excludes DoD personnel operating the system, placing operational responsibility with DHS.",
    "sourceIds": [
      5
    ],
    "whyItMatters": "If DHS proceeds to test and then seek deployment, there will be immediate policy, legal and human‑rights scrutiny (nonlethal vs. potential for harm), & possible congressional oversight. Watch for DHS/DoD statements, the memo text release, planned test locations/timelines, and any legal challenges or oversight hearings."
  },
  {
    "headline": "European Parliament awards 2026 Sakharov Prize to the International Criminal Court",
    "summary": "The European Parliament collectively awarded the 2026 Sakharov Prize for Freedom of Thought to the International Criminal Court and its officials — a high‑profile political gesture in the context of tensions between the U.S. administration and the ICC. This has diplomatic/political implications for international justice and relations.",
    "datedLine": "- Development date & evidence (compact): Development dated 2026‑10‑22 — the Parliament announced the 2026 Sakharov Prize laureate as the ICC and its officials. ([audiovisual.ec.europa.eu](https://audiovisual.ec.europa.eu/de/media/video/I-296445?utm_source=openai)) [6]",
    "supportingLine": "- Original publication / supporting excerpt: The European Union/Parliament media and press page records the award and quotes the Parliament President on recognizing the Court’s work. ([european-union.europa.eu](https://european-union.europa.eu/index_en?prefLang=ru&utm_source=openai)) [7]",
    "developmentDate": "2026-10-22",
    "reportExcerpt": "Development dated 2026‑10‑22 — the Parliament announced the 2026 Sakharov Prize laureate as the ICC and its officials.",
    "background": "The European Union/Parliament media and press page records the award and quotes the Parliament President on recognizing the Court’s work.",
    "sourceIds": [
      6,
      7
    ],
    "whyItMatters": "The award escalates symbolic European support for the ICC during a period of U.S. sanctions and diplomatic friction; expect statements from the ICC, EU, and U.S. officials and possible reciprocal diplomatic actions. Watch formal EU press releases, ICC responses, and U.S. policy statements."
  },
  {
    "headline": "West Bank shooting kills two Israeli soldiers; Israel orders closures ahead of elections",
    "summary": "Palestinian gunmen attacked near Hebron/the West Bank and Israeli forces said two Israeli soldiers were killed and the attackers were shot dead; Israeli authorities moved to close/lock down parts of the West Bank and increase security days before national elections. This is an immediate security and political flashpoint.",
    "datedLine": "- Development date & evidence (compact): Development dated 2026‑10‑23 — AP reports two Israeli soldiers were killed and two suspected gunmen were killed in a West Bank attack on Oct. 23, 2026. ([apnews.com](https://apnews.com/article/f6646718072b4ff6929cff43297edd05?utm_source=openai)) [8]",
    "supportingLine": "- Original publication / supporting excerpt: Reuters and other outlets reported on Oct. 23 that the attack prompted Israeli threats of a major West Bank offensive and orders to close movement in the territory ahead of upcoming elections. ([investing.com](https://www.investing.com/news/world-news/palestinian-gunmen-kill-two-israeli-soldiers-israel-threatens-new-west-bank-offensive-4969961?utm_source=openai)) [9]",
    "developmentDate": "2026-10-23",
    "reportExcerpt": "Development dated 2026‑10‑23 — AP reports two Israeli soldiers were killed and two suspected gunmen were killed in a West Bank attack on Oct. 23, 2026.",
    "background": "Reuters and other outlets reported on Oct. 23 that the attack prompted Israeli threats of a major West Bank offensive and orders to close movement in the territory ahead of upcoming elections.",
    "sourceIds": [
      8,
      9
    ],
    "whyItMatters": "The attack escalates West Bank tensions just before Israeli elections, raising the risk of wider West Bank operations and regional diplomatic fallout; watch Israeli government orders, IDF movements, and international diplomatic responses (U.S., EU, neighboring states)."
  }
];
const sources = [
  {
    "id": 1,
    "title": "whitehouse.gov — report source 1",
    "url": "https://www.whitehouse.gov/presidential-actions/2026/10/presidential-determination-pursuant-to-section-303-of-the-defense-production-act-of-1950-as-amended-on-domestic-petroleum-production-refining-and-logistics-capacity-c139/?utm_source=openai"
  },
  {
    "id": 2,
    "title": "energy.gov — report source 2",
    "url": "https://www.energy.gov/articles/energy-department-use-defense-production-act-funding-restart-american-refinery-and-expand?utm_source=openai"
  },
  {
    "id": 3,
    "title": "earthquake.usgs.gov — report source 3",
    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000u43g/?utm_source=openai"
  },
  {
    "id": 4,
    "title": "apnews.com — report source 4",
    "url": "https://apnews.com/article/0358c57cfcbc0de48d2486df15ded4ef?utm_source=openai"
  },
  {
    "id": 5,
    "title": "axios.com — report source 5",
    "url": "https://www.axios.com/2026/10/21/heat-ray-border-immigration-hegseth?utm_source=openai"
  },
  {
    "id": 6,
    "title": "audiovisual.ec.europa.eu — report source 6",
    "url": "https://audiovisual.ec.europa.eu/de/media/video/I-296445?utm_source=openai"
  },
  {
    "id": 7,
    "title": "european-union.europa.eu — report source 7",
    "url": "https://european-union.europa.eu/index_en?prefLang=ru&utm_source=openai"
  },
  {
    "id": 8,
    "title": "apnews.com — report source 8",
    "url": "https://apnews.com/article/f6646718072b4ff6929cff43297edd05?utm_source=openai"
  },
  {
    "id": 9,
    "title": "investing.com — report source 9",
    "url": "https://www.investing.com/news/world-news/palestinian-gunmen-kill-two-israeli-soldiers-israel-threatens-new-west-bank-offensive-4969961?utm_source=openai"
  }
];
const report = { notes: sections.map((section) => [
  `Deep dive — ${section.headline}`, section.summary, section.datedLine, section.supportingLine,
].join("\n")).join("\n\n"), sources };
const unicodeOnlyCurrentExcerpt = "Development dated 2026‑10‑23 — AP reports two Israeli soldiers were killed";
const candidate = ({ unicodeOnly = false } = {}) => ({
  title: observedTitle, scope: observedScope, limitations: [...observedLimitations],
  items: sections.map((section, index) => ({
    headline: section.headline, summary: section.summary, sourceIds: [...section.sourceIds],
    background: [{ text: section.background, sourceIds: [section.sourceIds.at(-1)] }],
    whyItMatters: section.whyItMatters, uncertainty: [], watchNext: [],
    developmentDate: section.developmentDate, scheduledDate: null,
    dateEvidence: { sourceId: section.sourceIds[0], reportExcerpt: unicodeOnly && index === 4
      ? unicodeOnlyCurrentExcerpt : section.reportExcerpt },
    evidenceStatus: "reported", dateBasis: "research-excerpt",
  })), sourceDetails: [],
});
const observedCandidate = () => {
  const value = candidate();
  for (const item of value.items) {
    item.developmentDate = null; item.dateEvidence = null; item.dateBasis = "unknown";
  }
  return value;
};
// The provider annotations recreate the canonical map rather than trusting IDs
// or URLs printed by the model. Removing only the numeric suffixes makes the
// normal extractor reproduce report.notes byte-for-byte, including Markdown.
const researchDocument = () => {
  let text = "", offset = 0;
  const annotations = [];
  for (const match of report.notes.matchAll(/ \[(\d+)\]/g)) {
    text += report.notes.slice(offset, match.index);
    const source = sources[Number(match[1]) - 1];
    annotations.push({ type: "url_citation", title: source.title, url: source.url,
      start_index: Math.max(0, text.lastIndexOf("\n") + 1), end_index: text.length });
    offset = match.index + match[0].length;
  }
  text += report.notes.slice(offset);
  return { status: "completed", output: [
    { type: "web_search_call", status: "completed", action: { type: "search", query: question } },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations }] },
  ] };
};
module.exports = { question, asOf, timeZone, report, sections, sources, observedTitle, observedScope,
  observedLimitations, unicodeOnlyCurrentExcerpt, candidate, observedCandidate, researchDocument };
