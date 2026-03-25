import { MatchingService, MatchResult } from './matchingService';
import { VehicleRepository, VehicleRow } from './vehicleRepository';
import { DbService } from './db';

const matchingService = new MatchingService();
const vehicleRepo = new VehicleRepository();

let vehicles: VehicleRow[];

beforeAll(async () => {
  vehicles = await vehicleRepo.getAllWithListingCount();
});

afterAll(async () => {
  await DbService.INST.close();
});

function findResult(results: MatchResult[], input: string): MatchResult | undefined {
  return results.find((r) => r.input === input);
}

const inputs = [
  'Volkswagen Golf 110TSI Comfortline Petrol Automatic Front Wheel Drive',
  'Volkswagen Golf 132TSI Automatic',
  'Volkswagen Golf Alltrack 132TSI',
  'VW Golf R with engine swap from Toyota 86 GT',
  'Golf GTI',
  'VW tiguan 162tsi allspace',
  'R-Line Tiguan',
  'VW Amarok Ultimate',
  'Amrok h/line 4x4',
  'RAV4 GX 4x4',
  'Toyota Camry Hybrid',
  'Toyota 86 GT Manual Petrol RWD',
  'Toyota 86 GTS Apollo Manual',
  'Toyota 86 GTS Auto',
  'Toyota Ascent Sports Hybrid',
  'Toyota Kluger Black E/d 4WD',
];

describe('Integration: match all input lines against real DB', () => {
  let results: MatchResult[];

  beforeAll(() => {
    results = inputs.map((input) => matchingService.match(input, vehicles));
  });

  it('loads vehicles from the database', () => {
    expect(vehicles.length).toBeGreaterThan(0);
  });

  it('produces a result for every input line', () => {
    expect(results.length).toBe(inputs.length);
  });

  // 1. All fields specified — perfect match
  it('"Volkswagen Golf 110TSI Comfortline Petrol Automatic Front Wheel Drive" → Golf 110TSI Comfortline', () => {
    const r = findResult(results, inputs[0])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('4749339721203712');
    expect(r.confidence).toBeGreaterThanOrEqual(8);
  });

  // 2. "132TSI" only appears in Alltrack 132TSI and Alltrack 132TSI Premium badges
  it('"Volkswagen Golf 132TSI Automatic" → Golf Alltrack 132TSI', () => {
    const r = findResult(results, inputs[1])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5734502139691008');
    expect(r.confidence).toBeGreaterThanOrEqual(5);
  });

  // 3. Exact make + model + badge
  it('"Volkswagen Golf Alltrack 132TSI" → Golf Alltrack 132TSI', () => {
    const r = findResult(results, inputs[2])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5734502139691008');
    expect(r.confidence).toBeGreaterThanOrEqual(5);
  });

  // 4. "VW" is abbreviation for Volkswagen, car is a Golf R — the Toyota 86 GT reference is about the engine swap, not the listing
  it('"VW Golf R with engine swap from Toyota 86 GT" → Golf R', () => {
    const r = findResult(results, inputs[3])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5824662093168640');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 5. No make specified, model + badge
  it('"Golf GTI" → Golf GTI', () => {
    const r = findResult(results, inputs[4])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('4628393442148352');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 6. "VW" abbreviation, "162tsi" + "allspace" → 162TSI Highline Allspace
  it('"VW tiguan 162tsi allspace" → Tiguan 162TSI Highline Allspace', () => {
    const r = findResult(results, inputs[5])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5332080883924992');
    expect(r.confidence).toBeGreaterThanOrEqual(2);
  });

  // 7. "R-Line" only appears in badge "132TSI R-Line Edition"
  it('"R-Line Tiguan" → Tiguan 132TSI R-Line Edition', () => {
    const r = findResult(results, inputs[6])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5811435875598336');
    expect(r.confidence).toBeGreaterThanOrEqual(2);
  });

  // 8. "Ultimate" only appears in TDI580 Ultimate badge
  it('"VW Amarok Ultimate" → Amarok TDI580 Ultimate', () => {
    const r = findResult(results, inputs[7])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('4951649860714496');
    expect(r.confidence).toBeGreaterThanOrEqual(2);
  });

  // 9. "Amrok" = Amarok (typo), "h/line" = Highline, "4x4" = Four Wheel Drive
  it('"Amrok h/line 4x4" → Amarok TDI550 Highline (4WD)', () => {
    const r = findResult(results, inputs[8])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5997253340692480');
    expect(r.confidence).toBeGreaterThanOrEqual(2);
  });

  // 10. RAV4 GX, "4x4" = Four Wheel Drive — only 4WD GX is Hybrid-Petrol
  it('"RAV4 GX 4x4" → RAV4 GX Hybrid-Petrol 4WD', () => {
    const r = findResult(results, inputs[9])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('4637157457133568');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 11. "Hybrid" indicates Hybrid-Petrol fuel type — Camry Ascent is the most generic hybrid Camry
  it('"Toyota Camry Hybrid" → Camry Ascent Hybrid-Petrol', () => {
    const r = findResult(results, inputs[10])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('6244675534979072');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 12. All fields except drive_type abbreviated — "RWD" = Rear Wheel Drive
  it('"Toyota 86 GT Manual Petrol RWD" → 86 GT Manual Petrol RWD', () => {
    const r = findResult(results, inputs[11])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5027098813005824');
    expect(r.confidence).toBeGreaterThanOrEqual(5);
  });

  // 13. "Apollo" narrows to GTS Apollo Blue — just missing "Blue"
  it('"Toyota 86 GTS Apollo Manual" → 86 GTS Apollo Blue Manual', () => {
    const r = findResult(results, inputs[12])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('4655849154805760');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 14. "Auto" = Automatic
  it('"Toyota 86 GTS Auto" → 86 GTS Automatic', () => {
    const r = findResult(results, inputs[13])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5871523743137792');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 15. "Ascent Sports" = Ascent Sport (typo), "Hybrid" = Hybrid-Petrol → Camry Ascent Sport Hybrid-Petrol
  it('"Toyota Ascent Sports Hybrid" → Camry Ascent Sport Hybrid-Petrol', () => {
    const r = findResult(results, inputs[14])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5118775628136448');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  // 16. "Black E/d" = Black Edition, "4WD" = Four Wheel Drive
  it('"Toyota Kluger Black E/d 4WD" → Kluger Black Edition 4WD', () => {
    const r = findResult(results, inputs[15])!;
    expect(r).toBeDefined();
    expect(r.vehicleId).toBe('5387024387276800');
    expect(r.confidence).toBeGreaterThanOrEqual(3);
  });

  it('every matched result has confidence >= 1', () => {
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(1);
    }
  });
});
