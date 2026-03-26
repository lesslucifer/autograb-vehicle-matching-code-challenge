import _ from 'lodash';
import { VehicleRow } from './vehicleRepository';
import { NGramTokenizer, VehicleTokenIndex, DICE_FUZZY_THRESHOLD } from './nGramTokenizer';

const FIELDS: Array<{ key: keyof VehicleRow; weight: number }> = [
  { key: 'make', weight: 3 },
  { key: 'model', weight: 2 },
  { key: 'badge', weight: 2 },
  { key: 'fuel_type', weight: 1 },
  { key: 'transmission_type', weight: 1 },
  { key: 'drive_type', weight: 1 },
];

interface IndexedField {
  tokens: string[];
  tokenNgrams: Array<Set<string>>;
  weight: number;
}

interface IndexedVehicle {
  vehicle: VehicleRow;
  fields: IndexedField[];
}

interface TokenHit {
  vehicleIdx: number;
  fieldIdx: number;
  tokenIdx: number;
  score: number;
}

export interface MatchResult {
  input: string;
  vehicleId: string;
  confidence: number;
}

export class MatchingService {
  private readonly tokenizer = new NGramTokenizer();
  private readonly indexed: IndexedVehicle[];
  private readonly index: VehicleTokenIndex;

  constructor(vehicles: VehicleRow[]) {
    this.indexed = vehicles.map((vehicle) => ({
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
    this.index = this.tokenizer.buildVehicleTokenIndex(this.indexed);
  }

  match(input: string): MatchResult {
    const inputTokens = this.tokenizer.tokenize(input);
    const hits = this.lookupHits(inputTokens);
    const candidates = this.aggregateScores(hits);
    const top = this.pickBest(candidates);

    if (!top) return { input, vehicleId: '', confidence: 0 };
    return { input, vehicleId: top.vehicle.id, confidence: Math.min(10, top.score) };
  }

  private lookupHits(inputTokens: string[]): TokenHit[] {
    return inputTokens.flatMap((token) => {
      const inputNgrams = this.tokenizer.ngrams(token);
      const exactHits = (this.index.tokenLocations.get(token) ?? [])
        .map((loc) => ({ ...loc, score: 1.0 }));

      const fuzzyTokens = new Set<string>();
      for (const ng of inputNgrams) {
        this.index.ngramToTokens.get(ng)?.forEach((t) => fuzzyTokens.add(t));
      }
      fuzzyTokens.delete(token);

      const fuzzyHits = Array.from(fuzzyTokens)
        .filter((t) => this.tokenizer.diceCoefficient(inputNgrams, this.index.tokenNgrams.get(t)!) >= DICE_FUZZY_THRESHOLD)
        .flatMap((t) => (this.index.tokenLocations.get(t) ?? []).map((loc) => ({ ...loc, score: 0.5 })));

      return [...exactHits, ...fuzzyHits];
    });
  }

  private aggregateScores(hits: TokenHit[]): Array<{ vehicle: VehicleRow; score: number }> {
    return _(hits)
      .groupBy('vehicleIdx')
      .map((vehicleHits, vehicleIdx) => {
        const pv = this.indexed[Number(vehicleIdx)];
        const score = _(vehicleHits)
          .groupBy('fieldIdx')
          .map((fieldHits, fieldIdx) => {
            const field = pv.fields[Number(fieldIdx)];
            const bestPerToken = _(fieldHits).groupBy('tokenIdx').map((th) => _.maxBy(th, 'score')!.score).sum();
            return (bestPerToken / Math.sqrt(field.tokens.length)) * field.weight;
          })
          .sum();
        return { vehicle: pv.vehicle, score };
      })
      .filter((c) => c.score > 0)
      .value();
  }

  private pickBest(candidates: Array<{ vehicle: VehicleRow; score: number }>) {
    return _(candidates)
      .orderBy([(c) => -c.score, (c) => -c.vehicle.listing_count])
      .head();
  }
}
