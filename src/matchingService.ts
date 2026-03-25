import { VehicleRow } from './vehicleRepository';
import { InputService } from './inputReader';

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

export class MatchingService {
  constructor(private readonly inputService: InputService) {}

  fieldMatches(normalizedInput: string, normalizedField: string): boolean {
    if (!normalizedField) return false;
    const escaped = normalizedField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
    return re.test(normalizedInput);
  }

  scoreVehicle(normalizedInput: string, vehicle: VehicleRow): number {
    let score = 0;
    for (const { key, weight } of FIELDS) {
      if (this.fieldMatches(normalizedInput, this.inputService.normalize(String(vehicle[key])))) {
        score += weight;
      }
    }
    return score;
  }

  match(lines: string[], vehicles: VehicleRow[]): MatchResult[] {
    const results: MatchResult[] = [];

    for (const line of lines) {
      const normalizedInput = this.inputService.normalize(line);

      const candidates = vehicles
        .map((v) => ({ vehicle: v, score: this.scoreVehicle(normalizedInput, v) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;

          const aMake = this.fieldMatches(normalizedInput, this.inputService.normalize(a.vehicle.make)) ? 1 : 0;
          const bMake = this.fieldMatches(normalizedInput, this.inputService.normalize(b.vehicle.make)) ? 1 : 0;
          if (bMake !== aMake) return bMake - aMake;

          const highTierKeys = ['model', 'badge'] as const;
          const aHigh = highTierKeys.filter((k) => this.fieldMatches(normalizedInput, this.inputService.normalize(a.vehicle[k]))).length;
          const bHigh = highTierKeys.filter((k) => this.fieldMatches(normalizedInput, this.inputService.normalize(b.vehicle[k]))).length;
          if (bHigh !== aHigh) return bHigh - aHigh;

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
