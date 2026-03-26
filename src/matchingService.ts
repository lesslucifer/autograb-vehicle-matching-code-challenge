import _ from 'lodash';
import { VehicleRow } from './vehicleRepository';
import { NGramTokenizer } from './nGramTokenizer';

const FIELDS: Array<{ key: keyof VehicleRow; weight: number }> = [
  { key: 'make', weight: 3 },
  { key: 'model', weight: 2 },
  { key: 'badge', weight: 2 },
  { key: 'fuel_type', weight: 1 },
  { key: 'transmission_type', weight: 1 },
  { key: 'drive_type', weight: 1 },
];

export interface TokenLocation {
  vehicleId: string;
  field: string;
  token: string;
}

export interface VehicleTokenIndex {
  tokenLocations: Map<string, TokenLocation[]>;
  ngramToTokens: Map<string, Set<string>>;
  tokenNgrams: Map<string, Set<string>>;
}

interface IndexedField {
  tokens: string[];
  weight: number;
}

interface IndexedVehicle {
  vehicle: VehicleRow;
  fields: Map<string, IndexedField>;
}

interface TokenHit {
  vehicleId: string;
  field: string;
  token: string;
  score: number;
}

export interface MatchResult {
  input: string;
  vehicleId: string;
  confidence: number;
}

export class MatchingService {
  private readonly tokenizer = new NGramTokenizer();
  private readonly vehicleMap: Map<string, IndexedVehicle>;
  private readonly tokenIndex: VehicleTokenIndex;

  constructor(vehicles: VehicleRow[]) {
    this.vehicleMap = new Map(vehicles.map((vehicle) => [
      vehicle.id,
      {
        vehicle,
        fields: new Map(FIELDS.map(({ key, weight }) => [
          key,
          { tokens: this.tokenizer.tokenize(String(vehicle[key])), weight },
        ])),
      },
    ]));
    this.tokenIndex = this.buildIndex();
  }

  match(input: string): MatchResult {
    const inputTokens = this.tokenizer.tokenize(input);
    const hits = this.lookupHits(inputTokens);
    const candidates = this.aggregateScores(hits);
    const top = _(candidates)
      .orderBy([(c) => -c.score, (c) => -c.vehicle.listing_count])
      .head();

    if (!top) return { input, vehicleId: '', confidence: 0 };
    return { input, vehicleId: top.vehicle.id, confidence: Math.min(10, top.score) };
  }

  private buildIndex(): VehicleTokenIndex {
    const allLocations = _([...this.vehicleMap]).flatMap(([vehicleId, { fields }]) =>
      Array.from(fields).flatMap(([field, { tokens }]) =>
        tokens.map((token): [string, TokenLocation] =>
          [token, { vehicleId, field, token }],
        ),
      ),
    );

    const tokenLocations = new Map(allLocations
      .groupBy(([token]) => token)
      .mapValues((entries) => entries.map(([, loc]) => loc))
      .entries()
      .value()
    );

    const tokenNgrams = new Map(allLocations
      .map(([token]) => token)
      .uniq()
      .map((token) => [token, this.tokenizer.ngrams(token)] as const)
      .value()
    );

    const ngramToTokens = new Map(_([...tokenNgrams])
      .flatMap(([token, grams]) => [...grams].map((ng) => [ng, token] as const))
      .groupBy(([ng]) => ng)
      .mapValues((entries) => new Set(entries.map(([, token]) => token)))
      .entries()
      .value()
    );

    return { tokenLocations, ngramToTokens, tokenNgrams };
  }

  private lookupHits(inputTokens: string[]): TokenHit[] {
    return inputTokens.flatMap((token) => {
      const inputNgrams = this.tokenizer.ngrams(token);
      const exactHits = (this.tokenIndex.tokenLocations.get(token) ?? [])
        .map((loc) => ({ ...loc, score: 1.0 }));

      const fuzzyTokens = new Set<string>();
      for (const ng of inputNgrams) {
        this.tokenIndex.ngramToTokens.get(ng)?.forEach((t) => fuzzyTokens.add(t));
      }
      fuzzyTokens.delete(token);

      const fuzzyHits = Array.from(fuzzyTokens)
        .map((t) => ({ t, dice: this.tokenizer.diceCoefficient(inputNgrams, this.tokenIndex.tokenNgrams.get(t)!) }))
        .filter(({ dice }) => dice ** 2 >= 0.1)
        .flatMap(({ t, dice }) => (this.tokenIndex.tokenLocations.get(t) ?? []).map((loc) => ({ ...loc, score: dice ** 2 })));

      return [...exactHits, ...fuzzyHits];
    });
  }

  private aggregateScores(hits: TokenHit[]): Array<{ vehicle: VehicleRow; score: number }> {
    return _(hits)
      .groupBy('vehicleId')
      .map((vehicleHits, vehicleId) => {
        const pv = this.vehicleMap.get(vehicleId)!;
        const score = _(vehicleHits)
          .groupBy('field')
          .map((fieldHits, field) => {
            const indexed = pv.fields.get(field)!;
            const bestPerToken = _(fieldHits).groupBy('token').map((th) => _.maxBy(th, 'score')!.score).sum();
            return (bestPerToken / Math.sqrt(indexed.tokens.length)) * indexed.weight;
          })
          .sum();
        return { vehicle: pv.vehicle, score };
      })
      .filter((c) => c.score > 0)
      .value();
  }
}
