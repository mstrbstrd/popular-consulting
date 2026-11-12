# Metabloom visual improvement loop

This first iteration makes a user correction reproducible, lets an improver propose a focused instruction change, compares that candidate with the current generator, and prepares a single-file patch for human review. It runs outside the chat request path. It does not autonomously deploy changes or learn from every saved conversation.

## Current scope

- Real production intent classifier, visual generator, schema validation and calculator interpreter.
- Six native visual types, exact supplied data, provenance type, graph relationships and calculator results.
- Twelve development cases and ten held-out cases. All committed cases are synthetic.
- Optional locally reviewed corrections, added only to development.
- A model-generated **JSON instruction candidate**, with no tools or executable code.
- Repeated, paired baseline/candidate trials, actual provider token usage, resolved model IDs, latency and outcome evidence.
- A review gate that regrades trial outputs instead of trusting a stored `passed` flag.
- Private append-only trial journals and reports in ignored `.metabloom-improvement/`.

This is a task-quality evaluation for visual generation. It does not measure browser rendering, tool-start/continuation acknowledgments, optional Jev offers, saved-research conversion, subjective aesthetics or general research accuracy. Existing regression/browser suites still cover their respective contracts. The loop does not collect production transcripts or introduce new storage services or HTTP endpoints.

## Invariants

| Boundary | Enforced behavior |
| --- | --- |
| Editable surface | Only `server/metabloomVisualGuidance.json` can appear in the generated promotion patch. Candidate files are parsed as JSON, never imported or executed. |
| Runtime authority | The HTTP handler does not accept guidance. The generator uses reviewed server configuration; the evaluator supplies a candidate through its internal dependency options. |
| Hard constraints | Auth, ownership, quotas, provenance validators, schema, native renderer, model choice, output budget and grading code are outside candidate scope. Mandatory generation instructions follow the supplemental guidance. |
| Current production behavior | The initial guidance is empty. With empty guidance, the original provider instruction string is unchanged. |
| Reproducibility | Candidate manifests bind to baseline guidance, relevant source files, development cases and the frozen held-out suite using SHA-256. Reports identify the Git commit and actual provider model. Source or case changes invalidate evidence. |
| Held-out separation | Only development failure evidence enters the proposer. Held-out results cannot be used as proposal input. Keep these cases out of manual improvement prompts too. |
| Correct refusal | Only a completed, structurally valid provider `unavailable` result counts. A timeout, outage or malformed response is not a successful refusal. |
| Promotion | Fixture results, missing/duplicate trials, provider failures, missing usage, changed models, stale evidence, failed candidate checks and excess cost prevent eligibility. |
| Side effects | Commands never push, merge, apply the generated patch, change runtime guidance, or send messages. Review remains separate from execution. |

The gate's fixed initial policy requires at least three trials per case, a development pass-rate improvement of at least five percentage points, all candidate checks passing on both splits, no held-out regression, total token usage no more than 1.25 times baseline, and p95 latency no more than 1.5 times baseline. Token usage is a cost proxy, not a dollar estimate. These are conservative project policies, not statistical proof of generalization. Expand the dataset and repetitions before widening scope.

## Run the first experiment

Node 24 is sufficient for this CLI and its unit tests; it adds no dependencies. Run from the repository root. Use an evaluation API key with a provider-side spending limit, supplied through the environment. Never paste it into a case, candidate, report, command argument or committed file.

```bash
npm run metabloom:improve -- check
npm run test:metabloom-improvement
```

These checks make no model calls and provide no evidence of model-quality improvement.

For live steps, set `OPENAI_API_KEY` through your existing secure environment configuration. The generator uses `METABLOOM_VISUAL_MODEL`, falling back to `METABLOOM_OPENAI_MODEL` and then `gpt-5-mini`. `--model` can select a specific model for a command. Use the same generation model for both evaluation splits. The proposer can use `METABLOOM_IMPROVER_MODEL` or its own `--model`.

1. Record the current generator's development failures:

```bash
npm run metabloom:improve -- evaluate --split development --trials 3 --max-calls 21 --live --out .metabloom-improvement/baseline.json
```

2. Ask the improver for a small generalizable instruction change:

```bash
npm run metabloom:improve -- propose --report .metabloom-improvement/baseline.json --live --out .metabloom-improvement/candidate.json
```

The proposer receives only failed development cases, expected outcomes, observations and any supplied user correction. It has no tools and cannot inspect the repo or held-out cases. If there are no behavioral failures, it stops rather than inventing an improvement. Inspect its hypothesis and instructions before spending on more trials. Reject answer copying or benchmark-specific wording.

3. Run paired development trials:

```bash
npm run metabloom:improve -- evaluate --split development --candidate .metabloom-improvement/candidate.json --trials 3 --max-calls 42 --live --out .metabloom-improvement/development.json
```

Baseline and candidate run together per task/trial. Each provider call has a bounded timeout, each evaluation a 15-minute deadline, and the planned call count is checked before any call. Completed trials are immediately written to a `.jsonl` journal. Interrupted or incomplete evidence cannot qualify a candidate.

4. Freeze the candidate and run held-out trials:

```bash
npm run metabloom:improve -- evaluate --split holdout --candidate .metabloom-improvement/candidate.json --trials 3 --max-calls 36 --live --out .metabloom-improvement/holdout.json
```

With the stock cases, the four live steps use up to 100 provider calls total, including the proposal. Locally added visual cases increase the required budget. A command never silently increases its budget. Do not repeatedly select candidates against the same holdout: after using its results to guide development, retire those cases from holdout and curate fresh independent cases.

5. Prepare evidence and, only if eligible, a review patch:

```bash
npm run metabloom:improve -- prepare --candidate .metabloom-improvement/candidate.json --development .metabloom-improvement/development.json --holdout .metabloom-improvement/holdout.json --out .metabloom-improvement/review.json
```

A rejected experiment saves its reasons and exits with status 2. An eligible experiment also creates `review.json.patch`. Eligibility means ready for human review, not approved or deployed. Review the hypothesis, failure evidence, changed instructions, metrics and existing regression checks before applying that patch on a branch and opening a PR. The patch changes only the guidance JSON. Reverting that reviewed change restores the prior instructions.

Files are never overwritten. Use fresh output names for subsequent experiments. Keep rejected reports and candidates so later proposals can be informed by failure evidence; a development report containing a failed candidate can itself be passed to `propose`. Reports are trusted local experiment artifacts, not cryptographically authenticated attestations.

## Turn a correction into a case

Copy `evals/metabloom/visuals/correction.example.json` into the ignored working directory. Replace its synthetic request, observed output, correction and expected result with a reviewed, minimal reproduction. Remove personal information, credentials, session IDs and unrelated history. Expected values must come from verified task requirements, not an unverified model answer.

```bash
npm run metabloom:improve -- record --input .metabloom-improvement/my-correction.json --reviewed
npm run metabloom:improve -- check
```

`record` writes `.metabloom-improvement/cases/<id>.json`, and future development evaluations include it. It refuses duplicate IDs/messages and never adds the correction to holdout. It does not send anything to a provider. The next explicitly live evaluation/proposal sends the selected development evidence to OpenAI with `store: false`. That setting is not a blanket data-retention guarantee.

Expected visual data is deliberately explicit. Table and chart requests in this small suite specify exact labels, units, order and quantities. Calculator checks evaluate independently chosen input/output pairs using control labels, allowing internal control IDs to vary. Flowchart checks compare named relationships while allowing node IDs and order to vary. Future cases should accept valid alternatives where the task allows them.

## Verification and rollout

The functional GitHub workflow runs the offline case check and improvement tests without model credentials. The test fixtures intentionally simulate provider responses and are not benchmark scores. Live model quality is unmeasured until the live commands complete.

Before a guidance PR is merged, run the existing visual/tool/research-reuse regressions, inspect representative components in the browser, and check truthful continuation behavior. These checks remain necessary because the first evaluation suite is narrower than the production system. Only then merge the reviewed guidance change using the repository's normal release process.

Next expansion should be driven by observed failures: measured browser rendering and acknowledgment checks, then research-quality evaluations and independently curated durable lessons. Full harness-code evolution or per-task recursive orchestration would require separate sandboxing, evaluation coverage and operating budgets.

## Research informing this implementation

- [Google RRSI](https://arxiv.org/abs/2609.24972): focused changes, evidence history, generalization and cost-aware acceptance.
- [Google AlphaEvolve and Harbor](https://cloud.google.com/blog/topics/developers-practitioners/how-to-build-an-agent-skill-optimizer-with-alphaevolve-and-harbor): matched baseline comparisons and unseen tasks.
- [Anthropic-published Warp case study](https://claude.com/resources/articles/how-warp-builds-self-improving-agents-on-claude): corrections become focused, reviewed instruction changes.
- [Anthropic tool optimization](https://www.anthropic.com/research/writing-tools-for-agents): task outcomes and transcripts guide tool improvements, checked against held-out evaluations.
