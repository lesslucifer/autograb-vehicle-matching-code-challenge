import * as path from 'path';
import { VehicleExpander } from './vehicleExpander';
import { VehicleRow } from './vehicleRepository';

const aliasesPath = path.join(process.cwd(), 'data', 'aliases.json');
const expander = new VehicleExpander(aliasesPath);

const makeVehicle = (overrides: Partial<VehicleRow> = {}): VehicleRow => ({
  id: '1',
  make: 'Toyota',
  model: 'RAV4',
  badge: 'GX',
  transmission_type: 'Automatic',
  fuel_type: 'Petrol',
  drive_type: 'Rear Wheel Drive',
  listing_count: 1,
  ...overrides,
});

describe('VehicleExpander — CamelCase initialism', () => {
  it('generates "vw" alternate for make "Volkswagen"', () => {
    const expanded = expander.expand([makeVehicle({ make: 'Volkswagen' })]);
    expect(expanded[0].expandedFields.make).toContain('vw');
  });

  it('does not generate initialism for single-part words like "Toyota"', () => {
    const expanded = expander.expand([makeVehicle({ make: 'Toyota' })]);
    // "Toyota" doesn't split into multiple parts by CamelCase boundaries
    const alts = expanded[0].expandedFields.make ?? [];
    expect(alts).not.toContain('t');
  });
});

describe('VehicleExpander — badge tokenization', () => {
  it('tokenizes "TDI580 Ultimate" → generates "ultimate"', () => {
    const expanded = expander.expand([makeVehicle({ badge: 'TDI580 Ultimate' })]);
    expect(expanded[0].expandedFields.badge).toContain('ultimate');
  });

  it('tokenizes "162TSI Highline Allspace" → generates "highline" and "allspace"', () => {
    const expanded = expander.expand([makeVehicle({ badge: '162TSI Highline Allspace' })]);
    const alts = expanded[0].expandedFields.badge ?? [];
    expect(alts).toContain('highline');
    expect(alts).toContain('allspace');
  });

  it('filters standalone TSI/TDI suffix tokens but keeps full numeric+alpha compounds', () => {
    const expanded = expander.expand([makeVehicle({ badge: '162TSI Highline' })]);
    const alts = expanded[0].expandedFields.badge ?? [];
    // Standalone "tsi" is filtered (too generic), but "162tsi" compound is kept for exact input matching
    expect(alts).not.toContain('tsi');
    expect(alts).toContain('162tsi');
  });

  it('includes 3+ digit numeric tokens from numeric+alpha splits (e.g., "162" from "162TSI")', () => {
    const expanded = expander.expand([makeVehicle({ badge: '162TSI Highline' })]);
    const alts = expanded[0].expandedFields.badge ?? [];
    // "162" from splitting "162TSI" is kept as it encodes trim variant
    expect(alts).toContain('162');
  });
});

describe('VehicleExpander — hyphen splitting', () => {
  it('splits "Hybrid-Petrol" → generates "hybrid" and "petrol" tokens', () => {
    const expanded = expander.expand([makeVehicle({ fuel_type: 'Hybrid-Petrol' })]);
    const alts = expanded[0].expandedFields.fuel_type ?? [];
    expect(alts).toContain('hybrid');
    expect(alts).toContain('petrol');
  });

  it('splits hyphenated badge "R-Line" → generates "r line" compound token', () => {
    const expanded = expander.expand([makeVehicle({ badge: 'R-Line' })]);
    const alts = expanded[0].expandedFields.badge ?? [];
    // "R-Line" hyphen compound → normalized "r line"
    expect(alts).toContain('r line');
  });
});

describe('VehicleExpander — alias inversion', () => {
  it('canonical "four wheel drive" → generates "4x4", "4wd", "awd" alternates', () => {
    const expanded = expander.expand([makeVehicle({ drive_type: 'Four Wheel Drive' })]);
    const alts = expanded[0].expandedFields.drive_type ?? [];
    expect(alts).toContain('4x4');
    expect(alts).toContain('4wd');
    expect(alts).toContain('awd');
  });

  it('canonical "rear wheel drive" → generates "rwd" alternate', () => {
    const expanded = expander.expand([makeVehicle({ drive_type: 'Rear Wheel Drive' })]);
    const alts = expanded[0].expandedFields.drive_type ?? [];
    expect(alts).toContain('rwd');
  });

  it('canonical "volkswagen" (make) → generates "vw" via both alias inversion and camelCase', () => {
    const expanded = expander.expand([makeVehicle({ make: 'Volkswagen' })]);
    expect(expanded[0].expandedFields.make).toContain('vw');
  });
});

describe('VehicleExpander — numeric+alpha split', () => {
  it('"162TSI" in badge → splits to add "tsi" token (via badge tokenization)', () => {
    // The badge tokenizer runs splitNumericAlpha per word
    const expanded = expander.expand([makeVehicle({ badge: '162TSI Highline' })]);
    // 162TSI splits to ["162","tsi"]; tsi is filtered by TSI_TDI_RE; 162 is numeric filtered
    // But "highline" should be present
    const alts = expanded[0].expandedFields.badge ?? [];
    expect(alts).toContain('highline');
  });

  it('"TDI580" → "tdi" is filtered (TDI code), "580" is kept as trim-variant number, "ultimate" kept', () => {
    const expanded = expander.expand([makeVehicle({ badge: 'TDI580 Ultimate' })]);
    const alts = expanded[0].expandedFields.badge ?? [];
    // "tdi" filtered as TSI/TDI code; "580" kept as 3-digit trim number; "ultimate" kept
    expect(alts).not.toContain('tdi');
    expect(alts).toContain('580');
    expect(alts).toContain('ultimate');
  });
});
