# FAQ

## How does the matching algorithm work?

See [SOLUTION.md](SOLUTION.md) for the full walkthrough. Both sides are normalized into the same token space, then compared using n-gram character similarity.

```
"VW Amrok h/line 4x4"
        │
        ▼
  [ normalize + expand aliases ]
        │
        ▼
  [ volkswagen, amrok, highline, four, wheel, drive ]
        │
        ▼
  [ lookup each token in inverted index  ]
  [ exact → 1.0 | fuzzy via n-grams → dice² ]
        │
        ▼
  [ group hits by vehicle → weight by field → sum ]
        │
        ▼
  [ rank by score, tiebreak by listing count ]
        │
        ▼
  Vehicle ID + Confidence (0-10)
```

## How do you handle misspellings and typos?

- Each token is split into character trigrams, and an inverted index maps trigrams back to known tokens
- `"amrok"` shares enough trigrams with `"amarok"` to surface it as a candidate
- The Dice coefficient measures trigram set overlap — if dice² exceeds 0.1, it's a hit

## Why use n-gram Dice coefficient over Levenshtein distance?

Levenshtein was used in an earlier iteration and hit two problems:

- **No candidate pruning** — Levenshtein compares against every known token. N-gram reverse map narrows candidates to only those sharing a trigram.
- **Unbounded scores** — Levenshtein returns raw edit distance that needs extra normalization. Dice is already bounded [0, 1].

## How do you separate strong matches from weak noise?

- Dice coefficient is squared before use
- Weak similarity (0.3) → 0.09 after squaring → filtered out by the 0.1 threshold
- Strong similarity (0.7+) → 0.49+ → survives easily

## How do you prevent multi-word fields from dominating the score?

- Each field's score is divided by `√(token count in that field)`
- Without this, "Four Wheel Drive" (3 exact hits) contributes 3× more than "Petrol" (1 exact hit), despite both being a single attribute match

## How do you weight different vehicle attributes?

| Field | Weight | Rationale |
|-------|--------|-----------|
| Make | 3 | Most distinctive |
| Model | 2 | Strong identifier within a make |
| Badge | 2 | Distinguishes variants |
| Fuel / Transmission / Drive | 1 | Metadata, often omitted |

## How do you handle marketplace abbreviations like "VW" and "4x4"?

- Alias dictionary ([src/aliases.json](src/aliases.json)) expands shorthand to canonical forms during preprocessing
- Uses word-boundary regex — `"vw"` inside `"vwsomething"` won't be falsely expanded
- Both input and vehicle records go through the same expansion

## How do you resolve ties between vehicles with the same score?

The vehicle with more listings wins — more common variants are more likely to appear in marketplace descriptions.

## How is the confidence score derived?

- Confidence = `min(10, total_vehicle_score)`
- Fully specified input → typically 8-10
- Partial input (missing fields) → scores lower proportionally

## Why normalize both sides instead of expanding vehicle data to match inputs?

- An earlier iteration tried pre-generating all possible token forms per vehicle — inherently fragile
- Normalizing both sides into a shared token space is simpler
- New abbreviations are handled by adding a single alias entry

## Why load all vehicles into memory instead of querying per input?

- The challenge doesn't allow modifying the database schema, so we can't add trigram indexes or use `pg_trgm`
- With a bare schema, matching would require a full table scan per query
- Loading everything into memory lets us build an inverted index with O(1) map lookups
- If we could modify the DB, `pg_trgm` with GIN indexes would be the alternative

## Why pre-build the index at startup instead of computing it per query?

- The index depends only on vehicle data, not on the input
- Building once means each `match()` call just does map lookups
- Rebuilding per query would turn O(V) startup into O(V × Q) total cost for no benefit

## What is the time and space complexity?

- **Startup:** O(V × F × T) — V vehicles, F fields (6), T tokens per field. Effectively O(V) for fixed schema.
- **Per query:** O(I × C) — I input tokens, C fuzzy candidates per token (limited by trigram overlap, typically small)
- **Space:** O(U × G) for n-gram maps — U unique tokens, G trigrams per token. ~60 vehicles = a few hundred entries, negligible.

## Why use an inverted index instead of comparing against every vehicle?

- Linear scan = O(I × V × T) per query — every input token compared against every vehicle token
- Inverted index flips this: trigram lookup in a map → only relevant candidates are compared

## Why is confidence capped at 10 instead of normalized to a 0-10 range?

- Score is a sum of weighted matches, not a ratio
- Maximum possible score varies per vehicle (different field lengths), so there's no stable denominator
- In practice, fully matched inputs score 8-10, so the cap rarely activates

## Could this approach scale to a much larger vehicle catalogue?

- **Thousands of vehicles** — still fine, index stays fast
- **Millions** — trigram collisions grow, would need database-side `pg_trgm` indexes or a search engine like Elasticsearch
- Scoring and weighting logic would remain the same regardless of scale
