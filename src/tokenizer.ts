import { distance } from 'fastest-levenshtein';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { removeStopwords } = require('stopword') as { removeStopwords: (tokens: string[]) => string[] };
import aliases from './aliases.json';

const FUZZY_MIN_LEN = 5;
const FUZZY_MAX_DIST = 1;

export class TokenizerService {
  private readonly aliasMap: Record<string, string> = aliases;

  tokenize(input: string): string[] {
    const normalized = input.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const expanded = this.expandAliases(normalized);
    const tokens = expanded.split(' ').filter(Boolean);
    return removeStopwords(tokens);
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

    let matched = 0;
    for (const ft of fieldTokens) {
      if (this.anyFuzzyMatch(ft, inputTokens)) matched++;
    }
    return matched / fieldTokens.length;
  }

  private anyFuzzyMatch(target: string, candidates: string[]): boolean {
    for (const c of candidates) {
      if (c === target) return true;
      if (
        target.length >= FUZZY_MIN_LEN &&
        c.length >= FUZZY_MIN_LEN &&
        distance(c, target) <= FUZZY_MAX_DIST
      ) {
        return true;
      }
    }
    return false;
  }
}
