import { VehicleRow } from './vehicleRepository';
import { InputService } from './inputReader';
import { ExpandedVehicle } from './vehicleExpander';

const FIELDS: Array<{ key: keyof VehicleRow; weight: number }> = [
  { key: 'make',              weight: 3 },
  { key: 'model',             weight: 2 },
  { key: 'badge',             weight: 2 },
  { key: 'fuel_type',         weight: 1 },
  { key: 'transmission_type', weight: 1 },
  { key: 'drive_type',        weight: 1 },
];

const MAX_SCORE = 10;

export interface MatchResult {
  input: string;
  vehicleId: string;
  confidence: number;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function getEditThreshold(len: number): number {
  return len <= 3 ? 0 : 1;
}

export class MatchingService {
  constructor(private readonly inputService: InputService) {}

  /** Check if normalizedField (canonical or alternate token) appears as a whole-word match in normalizedInput */
  private fieldValueMatches(normalizedInput: string, normalizedField: string): boolean {
    if (!normalizedField) return false;
    const escaped = normalizedField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
    return re.test(normalizedInput);
  }

  /** Public: check canonical field value in input (used by existing tests) */
  fieldMatches(normalizedInput: string, normalizedField: string): boolean {
    return this.fieldValueMatches(normalizedInput, normalizedField);
  }

  /** Check canonical value + all expanded alternates for a given field */
  private fieldMatchesExpanded(normalizedInput: string, vehicle: ExpandedVehicle, key: keyof VehicleRow): boolean {
    const val = vehicle[key];
    if (typeof val !== 'string') return false;

    // 1. Canonical value
    if (this.fieldValueMatches(normalizedInput, this.inputService.normalize(val))) return true;

    // 2. Expanded alternate tokens (expandedFields may be absent on plain VehicleRow)
    const alternates = vehicle.expandedFields?.[key];
    if (alternates) {
      for (const alt of alternates) {
        if (this.fieldValueMatches(normalizedInput, alt)) return true;
      }
    }

    return false;
  }

  /** Count how many badge alternate tokens match something in the input.
   *  Exact match for all tokens; fuzzy only for alpha-only tokens (no digits) to avoid numeric code false positives. */
  private countBadgeTokenMatches(normalizedInput: string, vehicle: ExpandedVehicle): number {
    const inputTokens = normalizedInput.split(/\s+/).filter((t) => t.length > 0);
    const badgeAlts = vehicle.expandedFields?.badge ?? [];
    return badgeAlts.filter((alt) => {
      // Exact whole-word match always tried first
      if (this.fieldValueMatches(normalizedInput, alt)) return true;
      // Fuzzy only for tokens without any digits (avoid "132tsi" fuzzy-matching "162tsi")
      if (/\d/.test(alt)) return false;
      const threshold = getEditThreshold(alt.length);
      return inputTokens.some((it) => levenshtein(alt, it) <= threshold);
    }).length;
  }

  /** Fuzzy token match: each token in normalizedField must find a close match in normalizedInput */
  fuzzyTokenMatches(normalizedInput: string, normalizedField: string): boolean {
    if (!normalizedField) return false;
    const fieldTokens = normalizedField.split(/\s+/).filter((t) => t.length > 0);
    const inputTokens = normalizedInput.split(/\s+/).filter((t) => t.length > 0);
    // Every field token must find at least one matching input token within threshold
    return fieldTokens.every((ft) => {
      const threshold = getEditThreshold(ft.length);
      return inputTokens.some((it) => levenshtein(ft, it) <= threshold);
    });
  }

  scoreVehicle(normalizedInput: string, vehicle: ExpandedVehicle | VehicleRow): number {
    const ev = 'expandedFields' in vehicle ? vehicle : { ...vehicle, expandedFields: {} };
    let score = 0;
    for (const { key, weight } of FIELDS) {
      if (this.fieldMatchesExpanded(normalizedInput, ev, key)) {
        score += weight;
      } else if (key === 'make' || key === 'model' || key === 'badge') {
        const val = vehicle[key];
        if (typeof val === 'string' && this.fuzzyTokenMatches(normalizedInput, this.inputService.normalize(val))) {
          score += weight;
        }
      }
    }
    return score;
  }

  match(lines: string[], vehicles: ExpandedVehicle[] | VehicleRow[]): MatchResult[] {
    // Accept plain VehicleRow[] for backwards compat (tests pass plain rows)
    const expanded: ExpandedVehicle[] = (vehicles as Array<VehicleRow | ExpandedVehicle>).map((v) => {
      if ('expandedFields' in v) return v as ExpandedVehicle;
      const row = v as VehicleRow;
      return { id: row.id, make: row.make, model: row.model, badge: row.badge, transmission_type: row.transmission_type, fuel_type: row.fuel_type, drive_type: row.drive_type, listing_count: row.listing_count, expandedFields: {} };
    });

    const results: MatchResult[] = [];

    for (const line of lines) {
      const normalizedInput = this.inputService.normalize(line);

      const candidates = expanded
        .map((v) => ({ vehicle: v, score: this.scoreVehicle(normalizedInput, v) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;

          const aMake = this.fieldMatchesExpanded(normalizedInput, a.vehicle, 'make') ? 1 : 0;
          const bMake = this.fieldMatchesExpanded(normalizedInput, b.vehicle, 'make') ? 1 : 0;
          if (bMake !== aMake) return bMake - aMake;

          const highTierKeys = ['model', 'badge'] as const;
          const aHigh = highTierKeys.filter((k) => this.fieldMatchesExpanded(normalizedInput, a.vehicle, k)).length;
          const bHigh = highTierKeys.filter((k) => this.fieldMatchesExpanded(normalizedInput, b.vehicle, k)).length;
          if (bHigh !== aHigh) return bHigh - aHigh;

          // Prefer vehicle with more badge alternate tokens matching the input
          const aBadge = this.countBadgeTokenMatches(normalizedInput, a.vehicle);
          const bBadge = this.countBadgeTokenMatches(normalizedInput, b.vehicle);
          if (bBadge !== aBadge) return bBadge - aBadge;

          return b.vehicle.listing_count - a.vehicle.listing_count;
        });

      if (candidates.length === 0) continue;

      const top = candidates[0];
      results.push({
        input: line,
        vehicleId: top.vehicle.id,
        confidence: Math.round((top.score / MAX_SCORE) * 10),
      });
    }

    return results;
  }
}
