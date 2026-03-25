/**
 * Integration tests against the real database.
 * Expected vehicle IDs reasoned from init.sql, not from running the code.
 * Requires: npm run db:up
 */
import { DbService } from './db';
import { VehicleRepository, VehicleRow } from './vehicleRepository';
import { MatchingService } from './matchingService';

let vehicles: VehicleRow[];
let matchingService: MatchingService;

beforeAll(async () => {
  vehicles = await new VehicleRepository().getAllWithListingCount();
  matchingService = new MatchingService();
});

afterAll(async () => {
  await DbService.INST.close();
});

function expectMatch(input: string, expectedVehicleId: string, minConfidence: number) {
  const [result] = matchingService.match([input], vehicles);
  expect(result).toBeDefined();
  expect(result.vehicleId).toBe(expectedVehicleId);
  expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
}

describe('inputs.txt — all 16 cases', () => {
  it('1. Volkswagen Golf 110TSI Comfortline Petrol Automatic Front Wheel Drive', () => {
    expectMatch('Volkswagen Golf 110TSI Comfortline Petrol Automatic Front Wheel Drive', '4749339721203712', 9);
  });

  it('2. Volkswagen Golf 132TSI Automatic', () => {
    expectMatch('Volkswagen Golf 132TSI Automatic', '5734502139691008', 5);
  });

  it('3. Volkswagen Golf Alltrack 132TSI', () => {
    expectMatch('Volkswagen Golf Alltrack 132TSI', '5734502139691008', 5);
  });

  it('4. VW Golf R with engine swap from Toyota 86 GT', () => {
    expectMatch('VW Golf R with engine swap from Toyota 86 GT', '5824662093168640', 5);
  });

  it('5. Golf GTI', () => {
    expectMatch('Golf GTI', '4628393442148352', 3);
  });

  it('6. VW tiguan 162tsi allspace', () => {
    expectMatch('VW tiguan 162tsi allspace', '4819708465381376', 5);
  });

  it('7. R-Line Tiguan', () => {
    expectMatch('R-Line Tiguan', '5811435875598336', 2);
  });

  it('8. VW Amarok Ultimate', () => {
    expectMatch('VW Amarok Ultimate', '4951649860714496', 5);
  });

  it('9. Amrok h/line 4x4', () => {
    expectMatch('Amrok h/line 4x4', '5997253340692480', 3);
  });

  it('10. RAV4 GX 4x4', () => {
    expectMatch('RAV4 GX 4x4', '4637157457133568', 4);
  });

  it('11. Toyota Camry Hybrid', () => {
    expectMatch('Toyota Camry Hybrid', '5118775628136448', 4);
  });

  it('12. Toyota 86 GT Manual Petrol RWD', () => {
    expectMatch('Toyota 86 GT Manual Petrol RWD', '5027098813005824', 9);
  });

  it('13. Toyota 86 GTS Apollo Manual', () => {
    expectMatch('Toyota 86 GTS Apollo Manual', '5308573789716480', 6);
  });

  it('14. Toyota 86 GTS Auto', () => {
    expectMatch('Toyota 86 GTS Auto', '5871523743137792', 6);
  });

  it('15. Toyota Ascent Sports Hybrid', () => {
    expectMatch('Toyota Ascent Sports Hybrid', '5118775628136448', 4);
  });

  it('16. Toyota Kluger Black E/d 4WD', () => {
    expectMatch('Toyota Kluger Black E/d 4WD', '5387024387276800', 6);
  });
});
