# Vehicle Matching Solution

## The Problem

Online vehicle marketplaces (Carsales, Facebook Marketplace, Gumtree, AutoTrader) produce listing descriptions that are inconsistent, abbreviated, misspelled, and often incomplete. Given a database of structured vehicle records — each with make, model, badge, transmission, fuel type, and drive type — the challenge is to take a raw text description and find the best-matching vehicle.

```
"VW Amrok h/line 4x4"  ──────>  ?  ──────>  Volkswagen Amarok Highline
                                                Diesel Automatic
                                                Four Wheel Drive
                                                (Vehicle ID: ...)
                                                (Confidence: 7)
```

The solution must also produce a **confidence score** (0-10) reflecting how certain the match is, and break ties using listing popularity.

## Solution Approach: N-Gram Fuzzy Matching

The core idea is to treat matching as a **text similarity problem** rather than an exact lookup problem. Instead of trying to parse vehicle descriptions into structured fields (which is brittle), we compare the raw input against every vehicle record using character-level similarity.

### Step 1: Normalize and Expand

Both the input and all vehicle field values go through the same preprocessing:

```
Raw input:     "VW Amrok h/line 4x4"
                    |
Lowercase:     "vw amrok h/line 4x4"
                    |
Strip chars:   "vw amrok h line 4x4"
                    |
Expand aliases: "volkswagen amrok highline four wheel drive"
                    |
Tokenize:      [ volkswagen, amrok, highline, four, wheel, drive ]
```

The alias dictionary maps common marketplace shorthand to canonical forms:

```
vw       →  volkswagen          auto  →  automatic
rwd      →  rear wheel drive    man   →  manual
fwd      →  front wheel drive   hline →  highline
4x4/4wd  →  four wheel drive    ed    →  edition
awd      →  four wheel drive    hyb   →  hybrid
```

This step ensures that `"VW"` and `"Volkswagen"` produce identical tokens, making them directly comparable.

### Step 2: Build an Inverted Index of Vehicle Tokens

**At startup**, every vehicle's fields are tokenized and indexed. For each token, we generate a set of **3-grams** (character trigrams with padding):

```
"golf"  →  { $$g, $go, gol, olf, lf$, f$$ }
"gol"   →  { $$g, $go, gol, ol$, l$$ }
"amarok" → { $$a, $am, ama, mar, aro, rok, ok$, k$$ }
```

Three data structures form the index:

```
                     ┌─────────────────────────────────────────┐
                     │           INVERTED INDEX                 │
                     ├─────────────────────────────────────────┤
  Token Locations:   │ "golf"   → [{vehicle:A, field:model},   │
                     │             {vehicle:B, field:model}]    │
                     │ "amarok" → [{vehicle:C, field:model}]    │
                     ├─────────────────────────────────────────┤
  Token N-grams:     │ "golf"   → {$$g, $go, gol, olf, lf$,   │
                     │             f$$}                         │
                     │ "amarok" → {$$a, $am, ama, mar, ...}    │
                     ├─────────────────────────────────────────┤
  N-gram → Tokens:   │ "gol" → {"golf", "gol"}                │
                     │ "ama" → {"amarok", "amaranth", ...}     │
                     └─────────────────────────────────────────┘
```

The **N-gram → Tokens** reverse map is what makes fuzzy lookup fast: given a misspelled input token, we find its n-grams, look up which known tokens share those n-grams, and score the overlap.

### Step 3: Score Each Input Token

For each token in the input, two types of matches are attempted:

**Exact match** — the token exists verbatim in the index. Score = **1.0**.

**Fuzzy match** — for tokens not found exactly (or in addition to exact matches), we:
1. Generate the input token's n-gram set
2. Find all indexed tokens sharing at least one n-gram (via the reverse map)
3. Compute the **Dice coefficient** between the two n-gram sets

```
                    Input token: "amrok"
                    N-grams:     {$$a, $am, amr, mro, rok, ok$, k$$}

                    Candidate:   "amarok"
                    N-grams:     {$$a, $am, ama, mar, aro, rok, ok$, k$$}

                    Shared:      {$$a, $am, rok, ok$, k$$}  →  5 shared

                    Dice = (2 × 5) / (7 + 8) = 0.667

                    Score = dice² = 0.44  ✓ (above 0.1 threshold)
```

Squaring the Dice coefficient penalizes weak matches more aggressively — a token with 0.3 similarity contributes only 0.09, which is filtered out.

### Step 4: Aggregate Scores Per Vehicle

Hits are grouped by vehicle, then by field. Each vehicle field has a **weight** reflecting its importance for identification:

```
        ┌────────────────────┬────────┐
        │ Field              │ Weight │
        ├────────────────────┼────────┤
        │ Make               │   3    │  ← most distinctive
        │ Model              │   2    │
        │ Badge              │   2    │
        │ Fuel Type          │   1    │
        │ Transmission Type  │   1    │
        │ Drive Type         │   1    │
        └────────────────────┴────────┘
```

For each field, the score is computed as:

```
field_score = (sum of best score per matched token) / sqrt(number of tokens in field) × weight
```

The **sqrt normalization** is important: it prevents multi-word field values (like "Four Wheel Drive" with 3 tokens) from having an unfair advantage over single-word values (like "Petrol"). Without it, matching all 3 tokens of "Four Wheel Drive" would contribute 3× as much as matching "Petrol", even though both represent a single attribute match.

A vehicle's total score is the sum across all fields:

```
    Input: "VW Amrok h/line 4x4"
    (after expansion: volkswagen amrok highline four wheel drive)

    Vehicle: Volkswagen Amarok Highline Diesel Automatic Four Wheel Drive

    ┌──────────────┬───────────────┬────────┬──────────┬───────┐
    │ Field        │ Matched       │ Raw    │ Norm.    │ W.Scr │
    ├──────────────┼───────────────┼────────┼──────────┼───────┤
    │ make(×3)     │ volkswagen    │ 1.0    │ 1.0/√1   │  3.0  │
    │ model(×2)    │ amrok≈amarok  │ 0.44   │ 0.44/√1  │  0.88 │
    │ badge(×2)    │ highline      │ 1.0    │ 1.0/√1   │  2.0  │
    │ fuel(×1)     │ —             │ 0      │ —        │  0    │
    │ trans(×1)    │ —             │ 0      │ —        │  0    │
    │ drive(×1)    │ four,wheel,   │ 3.0    │ 3.0/√3   │  1.73 │
    │              │ drive         │        │          │       │
    ├──────────────┼───────────────┼────────┼──────────┼───────┤
    │ TOTAL        │               │        │          │  7.61 │
    └──────────────┴───────────────┴────────┴──────────┴───────┘

    Confidence: 7 (capped at 10)
```

### Step 5: Rank and Select

```
    All candidate vehicles, sorted:

    ┌──────┬──────────────────────────────────────────┬───────┬──────────┐
    │ Rank │ Vehicle                                  │ Score │ Listings │
    ├──────┼──────────────────────────────────────────┼───────┼──────────┤
    │  1   │ VW Amarok Highline Diesel Auto 4WD       │  7.61 │    12    │
    │  2   │ VW Amarok Core Diesel Manual 4WD         │  4.20 │     8    │
    │  3   │ Toyota Kluger ... 4WD                    │  1.73 │     5    │
    └──────┴──────────────────────────────────────────┴───────┴──────────┘

    Winner: VW Amarok Highline  →  Vehicle ID: ..., Confidence: 7
```

If two vehicles have identical scores, the one with **more listings** wins — a heuristic reflecting that more common vehicle variants are more likely to appear in marketplace descriptions.

## Visual Summary of the Full Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT                                    │
│              "VW Amrok h/line 4x4"                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PREPROCESSING                                 │
│                                                                 │
│  lowercase → strip special chars → expand aliases → tokenize    │
│                                                                 │
│  Result: [volkswagen, amrok, highline, four, wheel, drive]      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TOKEN LOOKUP                                  │
│                                                                 │
│  For each input token:                                          │
│    1. Check exact match in index        → score 1.0             │
│    2. Find fuzzy candidates via n-grams → score dice²           │
│                                                                 │
│  Result: list of (vehicleId, field, token, score) hits          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SCORE AGGREGATION                             │
│                                                                 │
│  Group hits by vehicle → by field                               │
│  Per field: sum(best scores) / √(field tokens) × field weight   │
│  Per vehicle: sum of all field scores                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RANKING                                       │
│                                                                 │
│  Sort by: score (desc) → listing count (desc, tiebreaker)       │
│  Confidence = min(10, score)                                    │
│                                                                 │
│  Output: Vehicle ID + Confidence                                │
└─────────────────────────────────────────────────────────────────┘
```
