# Vehicle Matching

Matches free-text vehicle descriptions (e.g. "VW Amrok h/line 4x4") to structured vehicle records in PostgreSQL, producing a Vehicle ID and confidence score (0–10).

> **A note on AI usage:** I do use AI coding agent (Claude Code) for this project. However, all ideas, research, and architectural directions are my own, and all code has been manually read and refactored. See [WORKING_PROCESS.md](WORKING_PROCESS.md) for a detailed look at the iterative approach and decision-making behind this solution.

## Quick Start

**Prerequisites:** Docker, Node.js 18+

```bash
npm install
npm run db:up          # start PostgreSQL (waits for healthcheck)
npm run dev            # run the matcher
```

To tear down the database:

```bash
npm run db:down        # stop container
npm run db:reset       # stop, wipe data, restart fresh
```

## Algorithm Overview

Both the input description and every vehicle record are normalized into the same token space: lowercased, stripped of special characters, and expanded through an alias dictionary ("vw" → "volkswagen", "4x4" → "four wheel drive").

An **inverted n-gram index** is built at startup from all vehicle tokens. For each input token, exact matches score 1.0; fuzzy matches use the **Dice coefficient** (squared) over character trigrams, with a 0.1 threshold to filter noise. Hits are grouped by vehicle and field, weighted by importance (make 3, model 2, badge 2, others 1), and normalized by `sqrt(field token count)` to prevent multi-word fields from dominating.

The top-scoring vehicle wins. Ties are broken by listing count.

See [SOLUTION.md](SOLUTION.md) for the full pipeline walkthrough with diagrams and worked examples.

## Testing

```bash
npm run test              # unit tests (matching logic, input parsing, repository)
npm run test:integration  # 16 end-to-end cases against live PostgreSQL
npm run test:all          # both
npm run tsc               # type checking
```

Unit tests cover scoring, alias expansion, fuzzy matching, and tiebreaking. Integration tests run all 16 inputs from `inputs.txt` against the database, each asserting a specific vehicle ID and minimum confidence.

## Further Considerations

**Database-side matching** — The current approach loads all vehicles into memory to build the inverted index, since the challenge doesn't allow schema modifications. With schema access, PostgreSQL's `pg_trgm` extension and GIN indexes would move fuzzy matching into the database, eliminating the in-memory index and enabling per-query matching without full table scans.

**Scaling** — The in-memory index works well for hundreds or low thousands of vehicles. At larger scale, a dedicated search engine like Elasticsearch or database-side trigram indexes would be more appropriate. The scoring and weighting logic would remain unchanged.

**Alias coverage** — The alias dictionary handles common marketplace shorthand but isn't exhaustive. A production system could learn aliases from listing data or integrate a make/model reference dataset.

## Documentation

- [SOLUTION.md](SOLUTION.md) — Algorithm deep-dive with diagrams and worked scoring example
- [FAQ.md](FAQ.md) — Design decisions and trade-offs (why n-grams over Levenshtein, complexity analysis, etc.)
- [WORKING_PROCESS.md](WORKING_PROCESS.md) — Iteration history from regex matching to the final n-gram approach
