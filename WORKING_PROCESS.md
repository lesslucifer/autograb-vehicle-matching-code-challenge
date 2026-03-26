# Working Process

Match 16 free-text vehicle descriptions to structured records in PostgreSQL, with confidence scores (0–10). Tiebreak by listing count.

---

## Iteration 1: Regex Field Matching

Normalize input → regex word-boundary match against each vehicle field → sum weighted scores (make 3, model 2, badge 2, others 1).

**Worked:** exact inputs like "Volkswagen Golf 110TSI Comfortline Petrol Automatic Front Wheel Drive".

**Failed:** "VW" ≠ "Volkswagen", "4x4" ≠ "Four Wheel Drive", "Amrok" ≠ "Amarok". Regex is too rigid for real-world listings.

---

## Iteration 2: Vehicle Expansion (Abandoned)

Built a `VehicleExpander` (~170 lines) to pre-generate all possible token forms per vehicle: alias mappings, CamelCase splitting, hyphen splitting, Levenshtein fuzzy fallback.

**Why we dropped it:** Tried to enumerate all input forms upfront — inherently fragile. Created a parallel data structure that made scoring hard to reason about.

**Key insight:** Don't expand vehicle data to meet input. Normalize _both sides_ into a shared token space.

---

## Iteration 3: Token-Based Matching (The Pivot)

Replaced field-level regex with token-level comparison:

1. Normalize both sides identically (lowercase, strip chars)
2. Expand aliases with word-boundary regex ("vw" → "volkswagen")
3. Remove stopwords, split into tokens
4. Score overlap: exact = 1.0, fuzzy = 0.5, normalized by `sqrt(field token count)`

Also simplified the API from `match(lines[])` to `match(input)` and integrated lodash for cleaner data transformations.

---

## Iteration 4: N-Gram Index + Dice Coefficient (Final)

Replaced Levenshtein with n-gram Dice coefficient — set-based, bounded [0,1], and integrates with an inverted index for fast candidate pruning.

**Sub-iteration:** First tried a separate `precomputeVehicles()` step → unnecessary indirection → folded into the constructor. Also switched array indices to Maps for readability.

**Final pipeline:** tokenize input → lookup hits (exact + fuzzy) → aggregate by vehicle/field with weights → rank by score then listing count.

---

## Testing Approach

**Integration tests came first.** Before writing any matching logic, we set up `matchAllInputs.integration.test.ts` with all 16 inputs from `inputs.txt` running against the live PostgreSQL database. Each test case asserts a specific vehicle ID and minimum confidence threshold, with a comment explaining _why_ that's the expected match (e.g., "VW is abbreviation for Volkswagen, 4x4 = Four Wheel Drive"). This gave us a concrete pass/fail signal to develop against — every iteration was validated by running these 16 cases end-to-end.

**Unit tests were added during development** to cover individual components as we built them: `matchingService.test.ts` (26 tests for scoring logic, alias expansion, fuzzy matching, tiebreaking), `vehicleRepository.test.ts` (SQL query structure), and `inputReader.test.ts` (file parsing). These made it safe to refactor between iterations without breaking things we'd already gotten working.

---

## Reflections

Each iteration addressed specific failures of the previous one. The weighted scoring framework (make > model = badge > metadata) survived from iteration 1 through to the final solution. The biggest pivot was realizing that expanding vehicle data is the wrong direction — normalizing both sides into a shared token space was the key insight.
