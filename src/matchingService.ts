import { VehicleRow } from './vehicleRepository';
import { TokenizerService } from './tokenizer';

const FIELDS: Array<{ key: keyof VehicleRow; weight: number }> = [
  { key: 'make',              weight: 3 },
  { key: 'model',             weight: 2 },
  { key: 'badge',             weight: 2 },
  { key: 'fuel_type',         weight: 1 },
  { key: 'transmission_type', weight: 1 },
  { key: 'drive_type',        weight: 1 },
];

const MAX_SCORE = 11;

export interface MatchResult {
  input: string;
  vehicleId: string;
  confidence: number;
}

export class MatchingService {
  private readonly tokenizer = new TokenizerService();

  scoreVehicle(inputTokens: string[], vehicle: VehicleRow): number {
    let score = 0;
    for (const { key, weight } of FIELDS) {
      const fieldTokens = this.tokenizer.tokenize(String(vehicle[key]));
      const overlap = this.tokenizer.scoreTokenOverlap(inputTokens, fieldTokens);
      score += overlap * weight;
    }
    return score;
  }

  match(lines: string[], vehicles: VehicleRow[]): MatchResult[] {
    const results: MatchResult[] = [];

    for (const line of lines) {
      const inputTokens = this.tokenizer.tokenize(line);

      const candidates = vehicles
        .map((v) => ({ vehicle: v, score: this.scoreVehicle(inputTokens, v) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;

          const makeTokensA = this.tokenizer.tokenize(a.vehicle.make);
          const makeTokensB = this.tokenizer.tokenize(b.vehicle.make);
          const aMake = this.tokenizer.scoreTokenOverlap(inputTokens, makeTokensA) > 0 ? 1 : 0;
          const bMake = this.tokenizer.scoreTokenOverlap(inputTokens, makeTokensB) > 0 ? 1 : 0;
          if (bMake !== aMake) return bMake - aMake;

          const highTierKeys = ['model', 'badge'] as const;
          const aHigh = highTierKeys.reduce((s, k) => {
            const ft = this.tokenizer.tokenize(a.vehicle[k]);
            return s + this.tokenizer.scoreTokenOverlap(inputTokens, ft);
          }, 0);
          const bHigh = highTierKeys.reduce((s, k) => {
            const ft = this.tokenizer.tokenize(b.vehicle[k]);
            return s + this.tokenizer.scoreTokenOverlap(inputTokens, ft);
          }, 0);
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
