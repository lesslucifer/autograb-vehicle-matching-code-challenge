import _ from 'lodash';
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

  private highTierScore(inputTokens: string[], vehicle: VehicleRow): number {
    return _.sumBy(['model', 'badge'] as const, (k) =>
      this.tokenizer.scoreTokenOverlap(inputTokens, this.tokenizer.tokenize(vehicle[k]))
    );
  }

  match(input: string, vehicles: VehicleRow[]): MatchResult {
    const inputTokens = this.tokenizer.tokenize(input);

    const top = _(vehicles)
      .map((v) => ({ vehicle: v, score: this.scoreVehicle(inputTokens, v) }))
      .filter((c) => c.score > 0)
      .orderBy([
        (c) => -c.score,
        (c) => -c.vehicle.listing_count,
      ])
      .head();

    if (!top) {
      return { input, vehicleId: '', confidence: 0 };
    }

    return {
      input,
      vehicleId: top.vehicle.id,
      confidence: Math.min(10, top.score),
    };
  }
}
