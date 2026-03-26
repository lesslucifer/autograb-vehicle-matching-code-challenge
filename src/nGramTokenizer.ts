import _ from 'lodash';
import aliases from './aliases.json';

const NGRAM_SIZE = 3;
export const DICE_FUZZY_THRESHOLD = 0.6;
const PAD_CHAR = '$';

export class NGramTokenizer {
  private readonly compiledAliases = Object.entries(aliases).map(([alias, canonical]) => {
    const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { re: new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'g'), canonical };
  });

  tokenize(input: string): string[] {
    const normalized = input.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const expanded = this.expandAliases(normalized);
    return expanded.split(' ').filter(Boolean);
  }

  ngrams(token: string): Set<string> {
    if (token.length < NGRAM_SIZE) return new Set([token]);

    const padded = PAD_CHAR.repeat(NGRAM_SIZE - 1) + token + PAD_CHAR.repeat(NGRAM_SIZE - 1);
    const set = new Set<string>();
    for (let i = 0; i <= padded.length - NGRAM_SIZE; i++) {
      set.add(padded.substring(i, i + NGRAM_SIZE));
    }
    return set;
  }

  diceCoefficient(a: Set<string>, b: Set<string>): number {
    let intersection = 0;
    for (const g of a) {
      if (b.has(g)) intersection++;
    }
    return (2 * intersection) / (a.size + b.size);
  }

  private expandAliases(s: string): string {
    let result = s;
    for (const { re, canonical } of this.compiledAliases) {
      re.lastIndex = 0;
      result = result.replace(re, canonical);
    }
    return result;
  }
}
