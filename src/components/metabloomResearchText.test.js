import React from "react";
import { render, screen, within } from "@testing-library/react";
import { renderMetabloomResearchBlocks, renderMetabloomResearchText } from "./metabloomResearchText";

const sources = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1, title: `Fictional source ${index + 1}`, url: `https://example.org/research-${index + 1}`,
}));
const show = (text, canonical = sources) => render(<div role="article">{renderMetabloomResearchText(text, canonical)}</div>);

test("annotated Markdown links keep their labels and reuse the adjacent canonical citations", () => {
  const input = "The report quotes the agency ([Agency](https://example.org/research-1)) [1]. Another finding cites [the journal](https://example.org/research-9) [9].";
  show(input);
  expect(screen.getByRole("article")).toHaveTextContent("The report quotes the agency (Agency) [1]. Another finding cites the journal [9].");
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute("href", sources[0].url);
  expect(links[1]).toHaveAttribute("href", sources[8].url);
  for (const link of links) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(screen.getByRole("article")).not.toHaveTextContent("https://");
});

test("a Markdown link that matches an annotated source gains its canonical numeric citation", () => {
  show("Read [the source](HTTPS://EXAMPLE.ORG:443/research-9). The qualification remains.");
  expect(screen.getByRole("article")).toHaveTextContent("Read the source [9]. The qualification remains.");
  expect(screen.getByRole("link", { name: "Source 9: Fictional source 9" })).toHaveAttribute("href", sources[8].url);
});

test("unknown destinations remain visible inert claims even when followed by a valid citation", () => {
  show("See [a different report](https://unannotated.example/claim) [1], or [an altered query](https://example.org/research-1?claim=different).");
  expect(screen.getByRole("article")).toHaveTextContent("a different report (https://unannotated.example/claim) [1]");
  expect(screen.getByRole("article")).toHaveTextContent("an altered query (https://example.org/research-1?claim=different)");
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link")).toHaveAttribute("href", sources[0].url);
});

test("unsafe destinations and HTML stay literal while valid numeric sources remain available", () => {
  show("[Run code](javascript:alert(1)) [Inline data](data:text/html,test) <img src=x onerror=alert(1)> <script>alert(1)</script> [1].");
  const article = screen.getByRole("article");
  expect(article).toHaveTextContent("Run code (javascript:alert(1))");
  expect(article).toHaveTextContent("Inline data (data:text/html,test)");
  expect(article).toHaveTextContent("<img src=x onerror=alert(1)>");
  expect(article.querySelector("img, script")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link")).toHaveAttribute("href", sources[0].url);
});

test("balanced destination parentheses preserve trailing prose and resolve only the exact canonical URL", () => {
  const canonical = [{ id: 1, title: "Fictional source", url: "https://example.org/report_(trial)" }];
  show("Before [the trial](https://example.org/report_(trial)) and after [1].", canonical);
  expect(screen.getByRole("article")).toHaveTextContent("Before the trial [1] and after [1].");
  expect(screen.getAllByRole("link")).toHaveLength(2);
  for (const link of screen.getAllByRole("link")) expect(link).toHaveAttribute("href", canonical[0].url);
});

test("image syntax, escaped links, incomplete links, and unknown numeric markers retain their text", () => {
  const input = "![A diagram](https://example.org/research-1) \\[a literal link](https://example.org/research-1) [an unfinished link](https://example.org/research-1 [999].";
  show(input);
  expect(screen.getByRole("article").textContent).toBe(input);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("invalid source metadata cannot authorize a Markdown or numeric link", () => {
  const text = "[Unknown](https://example.org/research-1) [1].";
  // eslint-disable-next-line no-script-url -- Invalid canonical metadata must never become a link.
  show(text, [{ id: 1, title: "Unsafe", url: "javascript:alert(1)" }]);
  expect(screen.getByRole("article").textContent).toBe(text);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("full report formatting keeps complete prose, original numbering, and the exact stored notes", () => {
  const report = { sources, notes: "# Findings\n\nOpening evidence from [the agency](https://example.org/research-1) [1].\n\n- First qualification.\n- Second qualification [9].\n\n5. Read [the study](https://example.org/research-9).\n6. Check the final detail.\n\nThe final sentence remains visible." };
  const original = JSON.parse(JSON.stringify(report));
  render(<div role="article">{renderMetabloomResearchBlocks(report)}</div>);
  const article = screen.getByRole("article");
  expect(within(article).getByRole("heading", { name: "Findings", level: 4 })).toBeInTheDocument();
  const lists = within(article).getAllByRole("list");
  expect(lists.map((list) => list.tagName)).toEqual(["UL", "OL"]);
  expect(within(lists[1]).getAllByRole("listitem").map((item) => item.value)).toEqual([5, 6]);
  expect(article).toHaveTextContent("Opening evidence from the agency [1].");
  expect(article).toHaveTextContent("The final sentence remains visible.");
  expect(report).toEqual(original);
});
