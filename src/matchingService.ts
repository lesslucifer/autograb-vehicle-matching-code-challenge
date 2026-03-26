import _ from 'lodash';
import { VehicleRepository, VehicleRow } from './vehicleRepository';
import { TokenizerService, NgramIndex } from './tokenizer';

const FIELDS: Array<{ key: keyof VehicleRow; weight: number }> = [
  { key: 'make',              weight: 3 },
  { key: 'model',             weight: 2 },
  { key: 'badge',             weight: 2 },
  { key: 'fuel_type',         weight: 1 },
  { key: 'transmission_type', weight: 1 },
  { key: 'drive_type',        weight: 1 },
];

export interface PrecomputedField {
  tokens: string[];
  tokenNgrams: Array<Set<string>>;
  weight: number;
}

export interface PrecomputedVehicle {
  vehicle: VehicleRow;
  fields: PrecomputedField[];
}

export interface MatchResult {
  input: string;
  vehicleId: string;
  confidence: number;
}

export class MatchingService {
  private readonly tokenizer = new TokenizerService();
  private readonly vehicleRepo = new VehicleRepository();

  precomputeVehicles(vehicles: VehicleRow[]): PrecomputedVehicle[] {
    return vehicles.map((vehicle) => ({
      vehicle,
      fields: FIELDS.map(({ key, weight }) => {
        const tokens = this.tokenizer.tokenize(String(vehicle[key]));
        return {
          tokens,
          tokenNgrams: tokens.map((t) => this.tokenizer.ngrams(t)),
          weight,
        };
      }),
    }));
  }

  scoreVehicle(index: NgramIndex, precomputed: PrecomputedVehicle): number {
    let score = 0;
    for (const { tokens, tokenNgrams, weight } of precomputed.fields) {
      const overlap = this.tokenizer.scoreTokenOverlap(index, tokens, tokenNgrams);
      score += overlap * weight;
    }
    return score;
  }

  match(input: string, precomputed: PrecomputedVehicle[]): MatchResult {
    const inputTokens = this.tokenizer.tokenize(input);
    const inputNGram = this.tokenizer.buildNgramIndex(inputTokens);

    const top = _(precomputed)
      .map((p) => ({ vehicle: p.vehicle, score: this.scoreVehicle(inputNGram, p) }))
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
