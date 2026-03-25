import { distance } from 'fastest-levenshtein';
import aliases from './aliases.json';

const FUZZY_MIN_LEN = 5;
const FUZZY_MAX_DIST = 1;

export class TokenizerService {
  private readonly aliasMap: Record<string, string> = aliases;

  tokenize(input: string): string[] {
    const normalized = input.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const expanded = this.expandAliases(normalized);
    const tokens = expanded.split(' ').filter(Boolean);
    return tokens
    // return removeStopwords(tokens);
  }

  private expandAliases(s: string): string {
    let result = s;
    for (const [alias, canonical] of Object.entries(this.aliasMap)) {
      const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'g');
      result = result.replace(re, canonical);
    }
    return result;
  }

  scoreTokenOverlap(inputTokens: string[], fieldTokens: string[]): number {
    if (fieldTokens.length === 0) return 0;

    let totalQuality = 0;
    for (const ft of fieldTokens) {
      totalQuality += this.bestMatchQuality(ft, inputTokens);
    }
    return totalQuality / Math.sqrt(fieldTokens.length);
  }

  private bestMatchQuality(target: string, candidates: string[]): number {
    const EXACT_SCORE = 1.0;
    const FUZZY_SCORE = 0.5;

    let best = 0;
    for (const c of candidates) {
      if (c === target) return EXACT_SCORE;
      if (
        best < FUZZY_SCORE &&
        target.length >= FUZZY_MIN_LEN &&
        c.length >= FUZZY_MIN_LEN &&
        distance(c, target) <= FUZZY_MAX_DIST
      ) {
        best = FUZZY_SCORE;
      }
    }
    return best;
  }
}
