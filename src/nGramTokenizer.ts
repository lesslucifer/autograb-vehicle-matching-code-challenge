import _ from 'lodash';
import aliases from './aliases.json';

const NGRAM_SIZE = 3;
export const DICE_FUZZY_THRESHOLD = 0.6;
const PAD_CHAR = '$';

export interface NgramIndex {
  exactMap: Map<string, number>;
  ngramMap: Map<string, Set<number>>;
  candidateNgrams: Map<number, Set<string>>;
}

export interface TokenLocation {
  vehicleIdx: number;
  fieldIdx: number;
  tokenIdx: number;
}

export interface VehicleTokenIndex {
  tokenLocations: Map<string, TokenLocation[]>;
  ngramToTokens: Map<string, Set<string>>;
  tokenNgrams: Map<string, Set<string>>;
}

export interface IndexableVehicle {
  fields: Array<{ tokens: string[] }>;
}

export class NGramTokenizer {
  private readonly compiledAliases: Array<{ re: RegExp; canonical: string }>;
  private readonly tokenCache = new Map<string, string[]>();
  private readonly ngramCache = new Map<string, Set<string>>();

  constructor() {
    this.compiledAliases = Object.entries(aliases).map(([alias, canonical]) => {
      const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { re: new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'g'), canonical };
    });
  }

  tokenize(input: string): string[] {
    const cached = this.tokenCache.get(input);
    if (cached) return cached;

    const normalized = input.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const expanded = this.expandAliases(normalized);
    const tokens = expanded.split(' ').filter(Boolean);
    this.tokenCache.set(input, tokens);
    return tokens;
  }

  private expandAliases(s: string): string {
    let result = s;
    for (const { re, canonical } of this.compiledAliases) {
      re.lastIndex = 0;
      result = result.replace(re, canonical);
    }
    return result;
  }

  scoreTokenOverlap(index: NgramIndex, fieldTokens: string[], fieldNgrams: Array<Set<string>>): number {
    if (fieldTokens.length === 0) return 0;

    let totalQuality = 0;
    for (let i = 0; i < fieldTokens.length; i++) {
      totalQuality += this.ngramTokenScore(fieldTokens[i], fieldNgrams[i], index);
    }
    return totalQuality / Math.sqrt(fieldTokens.length);
  }

  ngrams(token: string): Set<string> {
    const cached = this.ngramCache.get(token);
    if (cached) return cached;

    if (token.length < NGRAM_SIZE) {
      const set = new Set([token]);
      this.ngramCache.set(token, set);
      return set;
    }

    const padded = PAD_CHAR.repeat(NGRAM_SIZE - 1) + token + PAD_CHAR.repeat(NGRAM_SIZE - 1);
    const set = new Set<string>();
    for (let i = 0; i <= padded.length - NGRAM_SIZE; i++) {
      set.add(padded.substring(i, i + NGRAM_SIZE));
    }
    this.ngramCache.set(token, set);
    return set;
  }

  buildNgramIndex(candidates: string[]): NgramIndex {
    const exactMap = new Map<string, number>();
    const ngramMap = new Map<string, Set<number>>();
    const candidateNgrams = new Map<number, Set<string>>();

    for (let i = 0; i < candidates.length; i++) {
      const token = candidates[i];
      exactMap.set(token, i);
      const grams = this.ngrams(token);
      candidateNgrams.set(i, grams);
      for (const ng of grams) {
        let indices = ngramMap.get(ng);
        if (!indices) {
          indices = new Set();
          ngramMap.set(ng, indices);
        }
        indices.add(i);
      }
    }

    return { exactMap, ngramMap, candidateNgrams };
  }

  buildVehicleTokenIndex(vehicles: IndexableVehicle[]): VehicleTokenIndex {
    const tokenLocations = new Map<string, TokenLocation[]>();
    const ngramToTokens = new Map<string, Set<string>>();
    const tokenNgrams = new Map<string, Set<string>>();

    for (let vehicleIdx = 0; vehicleIdx < vehicles.length; vehicleIdx++) {
      const { fields } = vehicles[vehicleIdx];
      for (let fieldIdx = 0; fieldIdx < fields.length; fieldIdx++) {
        const { tokens } = fields[fieldIdx];
        for (let tokenIdx = 0; tokenIdx < tokens.length; tokenIdx++) {
          const token = tokens[tokenIdx];
          const loc: TokenLocation = { vehicleIdx, fieldIdx, tokenIdx };

          let locs = tokenLocations.get(token);
          if (!locs) { locs = []; tokenLocations.set(token, locs); }
          locs.push(loc);

          if (!tokenNgrams.has(token)) {
            const grams = this.ngrams(token);
            tokenNgrams.set(token, grams);
            for (const ng of grams) {
              let tokens = ngramToTokens.get(ng);
              if (!tokens) { tokens = new Set(); ngramToTokens.set(ng, tokens); }
              tokens.add(token);
            }
          }
        }
      }
    }

    return { tokenLocations, ngramToTokens, tokenNgrams };
  }

  diceCoefficient(a: Set<string>, b: Set<string>): number {
    let intersection = 0;
    for (const g of a) {
      if (b.has(g)) intersection++;
    }
    return (2 * intersection) / (a.size + b.size);
  }

  private findCandidateNgrams(targetGrams: Set<string>, index: NgramIndex): Array<Set<string>> {
    const indices = new Set<number>();
    targetGrams.forEach(ng => index.ngramMap.get(ng)?.forEach(idx => indices.add(idx)));
    return Array.from(indices).map(idx => index.candidateNgrams.get(idx)!);
  }

  private ngramTokenScore(target: string, targetGrams: Set<string>, index: NgramIndex): number {
    if (index.exactMap.has(target)) return 1.0;

    const candidates = this.findCandidateNgrams(targetGrams, index);
    if (candidates.length === 0) return 0;

    const best = _.maxBy(candidates, (c) => this.diceCoefficient(targetGrams, c))!;
    const score = this.diceCoefficient(targetGrams, best);
    return score >= DICE_FUZZY_THRESHOLD ? 0.5 : 0
  }
}
