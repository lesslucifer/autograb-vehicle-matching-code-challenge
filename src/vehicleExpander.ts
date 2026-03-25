import * as fs from 'fs';
import * as path from 'path';
import { VehicleRow } from './vehicleRepository';

export interface ExpandedVehicle extends VehicleRow {
  expandedFields: {
    [K in keyof VehicleRow]?: string[];
  };
}

// Tokens that are generic TSI/TDI codes or too short to be useful as standalone badge tokens
// Matches: "tsi", "tdi", "110tsi", "tdi580", "tsi580", "162tsi", etc.
const TSI_TDI_RE = /^(\d+)?t[sd]i(\d+)?$/i;

// Generic words that are not useful as standalone badge discriminators
const BADGE_STOP_WORDS = new Set(['line', 'core', 'plus', 'base']);

function isBadgeTokenSignificant(token: string, fromNumericSplit = false): boolean {
  if (token.length < 3) return false;
  // Allow 3+ digit numbers from numeric+alpha splits (e.g., "162" from "162TSI") as they encode trim variants
  if (/^\d+$/.test(token) && !fromNumericSplit) return false;  // filter purely numeric from word splits
  if (/^\d+$/.test(token) && fromNumericSplit && token.length < 3) return false;
  if (TSI_TDI_RE.test(token)) return false;      // TSI/TDI codes like "tsi", "tdi", "110tsi", "tdi580"
  if (BADGE_STOP_WORDS.has(token)) return false; // generic words not useful standalone
  return true;
}

/** Split "162TSI" → ["162", "tsi"] */
function splitNumericAlpha(token: string): string[] {
  const match = token.match(/^(\d+)([a-z]+\d*)$/i);
  if (match) return [match[1], match[2].toLowerCase()];
  const match2 = token.match(/^([a-z]+)(\d+)$/i);
  if (match2) return [match2[1].toLowerCase(), match2[2]];
  return [];
}

/** Split "Volkswagen" → "vw" via CamelCase boundary initialism */
function camelCaseInitialism(word: string): string | null {
  // Split on uppercase letter boundaries: "Volkswagen" → ["Volks","wagen"]
  const parts = word.split(/(?=[A-Z])/);
  if (parts.length < 2) return null;
  // Build initialism from first char of each part (lowercase)
  const initialism = parts.map((p) => p[0].toLowerCase()).join('');
  return initialism.length >= 2 ? initialism : null;
}

/** Tokenize a badge string into significant individual tokens */
function tokenizeBadge(badge: string): string[] {
  const tokens: string[] = [];

  // Extract each hyphen-compound substring and add normalized form
  // e.g., in "132TSI R-Line Edition": find "R-Line" → add "r line"
  const hyphenCompoundRe = /[A-Za-z0-9]+-[A-Za-z0-9]+/g;
  for (const compound of badge.matchAll(hyphenCompoundRe)) {
    const normalized = compound[0].replace(/-/g, ' ').toLowerCase().trim();
    if (normalized.length >= 3) tokens.push(normalized);
  }

  // Tokenize all words (ignoring hyphens as separators)
  const words = badge.replace(/[-–]/g, ' ').split(/\s+/);
  for (const word of words) {
    const lower = word.toLowerCase();
    if (isBadgeTokenSignificant(lower)) {
      tokens.push(lower);
    }
    // Also try numeric+alpha split (fromNumericSplit=true allows 3+ digit numbers)
    const subTokens = splitNumericAlpha(word);
    if (subTokens.length > 0) {
      // Also add the original compound as-is (e.g., "162tsi") so input "162tsi" matches directly
      if (lower.length >= 3) tokens.push(lower);
      for (const sub of subTokens) {
        if (isBadgeTokenSignificant(sub, true)) {
          tokens.push(sub);
        }
      }
    }
  }
  return [...new Set(tokens)];
}

/** Split a field value on hyphens and return the parts (lowercased) */
function hyphenSplitTokens(value: string): string[] {
  if (!value.includes('-') && !value.includes('–')) return [];
  return value
    .split(/[-–]/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
}

export class VehicleExpander {
  private aliases: Record<string, string>;
  // inverted: canonical value → list of abbreviation keys
  private invertedAliases: Map<string, string[]>;

  constructor(aliasesPath: string = path.join(process.cwd(), 'data', 'aliases.json')) {
    const raw = fs.readFileSync(aliasesPath, 'utf8');
    this.aliases = JSON.parse(raw) as Record<string, string>;
    this.invertedAliases = new Map();
    for (const [abbrev, canonical] of Object.entries(this.aliases)) {
      const existing = this.invertedAliases.get(canonical) ?? [];
      existing.push(abbrev);
      this.invertedAliases.set(canonical, existing);
    }
  }

  /** Get all abbreviation alternates for a canonical field value */
  private aliasAlternates(value: string): string[] {
    const normalized = value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return this.invertedAliases.get(normalized) ?? [];
  }

  private expandField(value: string, isBadge: boolean): string[] {
    const tokens = new Set<string>();

    // 1. Alias alternates (inverted from canonical values)
    for (const abbrev of this.aliasAlternates(value)) {
      tokens.add(abbrev);
    }

    // 2. Hyphen splitting — add each part as an alternate (e.g., "Hybrid-Petrol" → "hybrid", "petrol")
    // For badge fields, only use the split parts for alias lookup, not as standalone tokens
    // (to avoid generic words like "line" matching unrelated inputs)
    for (const part of hyphenSplitTokens(value)) {
      if (!isBadge) {
        tokens.add(part);
      }
      // Always check aliases for hyphen-split parts (e.g., "hybrid" → alias lookup)
      for (const abbrev of this.aliasAlternates(part)) {
        tokens.add(abbrev);
      }
    }

    // 3. CamelCase initialism (for single-word values like make names; skip for badge to avoid acronym noise)
    if (!isBadge) {
      const words = value.split(/\s+/);
      for (const word of words) {
        const initialism = camelCaseInitialism(word);
        if (initialism) tokens.add(initialism);
      }
    }

    // 4. Badge-specific tokenization
    if (isBadge) {
      for (const t of tokenizeBadge(value)) {
        tokens.add(t);
      }
    }

    return [...tokens];
  }

  expand(vehicles: VehicleRow[]): ExpandedVehicle[] {
    return vehicles.map((v) => {
      const expandedFields: ExpandedVehicle['expandedFields'] = {};

      const fieldKeys: Array<keyof VehicleRow> = ['make', 'model', 'badge', 'transmission_type', 'fuel_type', 'drive_type'];
      for (const key of fieldKeys) {
        const val = v[key];
        if (typeof val !== 'string') continue;
        const isBadge = key === 'badge';
        const alternates = this.expandField(val, isBadge);
        if (alternates.length > 0) {
          expandedFields[key] = alternates;
        }
      }

      return { ...v, expandedFields };
    });
  }
}
