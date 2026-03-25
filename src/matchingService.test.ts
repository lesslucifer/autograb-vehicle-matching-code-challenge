import { MatchingService } from './matchingService';
import { TokenizerService } from './tokenizer';
import { VehicleRow } from './vehicleRepository';

const matchingService = new MatchingService();
const tokenizer = new TokenizerService();

const scoreVehicle = (input: string, v: VehicleRow) =>
  matchingService.scoreVehicle(tokenizer.tokenize(input), v);

const makeVehicle = (overrides: Partial<VehicleRow> = {}): VehicleRow => ({
  id: '1',
  make: 'Toyota',
  model: '86',
  badge: 'GT',
  transmission_type: 'Manual',
  fuel_type: 'Petrol',
  drive_type: 'Rear Wheel Drive',
  listing_count: 1,
  ...overrides,
});

describe('MatchingService.scoreVehicle', () => {
  it('scores 0 when nothing matches', () => {
    const v = makeVehicle();
    expect(scoreVehicle('volkswagen golf', v)).toBe(0);
  });

  it('scores make only (weight 3)', () => {
    const v = makeVehicle();
    expect(scoreVehicle('toyota', v)).toBe(3);
  });

  it('scores make + model (3+2=5)', () => {
    const v = makeVehicle();
    expect(scoreVehicle('toyota 86', v)).toBe(5);
  });

  it('scores all fields (max 10)', () => {
    const v = makeVehicle();
    expect(scoreVehicle('toyota 86 gt manual petrol rear wheel drive', v)).toBeCloseTo(10.73, 1);
  });

  it('expands alias RWD → Rear Wheel Drive', () => {
    const v = makeVehicle();
    expect(scoreVehicle('toyota 86 gt manual petrol rwd', v)).toBeCloseTo(10.73, 1);
  });

  it('expands alias VW → Volkswagen', () => {
    const v = makeVehicle({ make: 'Volkswagen', model: 'Golf', badge: '110TSI Comfortline', transmission_type: 'Automatic', fuel_type: 'Petrol', drive_type: 'Front Wheel Drive' });
    expect(scoreVehicle('vw golf petrol automatic front wheel drive', v)).toBeGreaterThan(5);
  });

  it('partial badge scoring — 1 of 2 badge tokens matches', () => {
    const v = makeVehicle({ model: 'Golf', badge: 'Alltrack 132TSI' });
    const score = scoreVehicle('volkswagen golf 132tsi automatic', v);
    expect(score).toBeGreaterThan(2);
  });

  it('full badge match scores full badge weight', () => {
    const v = makeVehicle({ model: 'Golf', badge: 'Alltrack 132TSI' });
    const score = scoreVehicle('golf alltrack 132tsi', v);
    expect(score).toBeCloseTo(4.83, 1);
  });

  it('fuzzy matches typo — Amrok matches Amarok', () => {
    const v = makeVehicle({ make: 'Volkswagen', model: 'Amarok', badge: 'TDI550 Highline', transmission_type: 'Automatic', fuel_type: 'Diesel', drive_type: 'Four Wheel Drive' });
    const score = scoreVehicle('amrok highline 4x4', v);
    expect(score).toBeGreaterThan(0);
  });
});

describe('MatchingService.match', () => {
  it('returns empty array when no lines given', () => {
    expect(matchingService.match([], [makeVehicle()])).toEqual([]);
  });

  it('returns empty array when no vehicles given', () => {
    expect(matchingService.match(['toyota 86'], [])).toEqual([]);
  });

  it('skips lines that score 0 against all vehicles', () => {
    const results = matchingService.match(['honda civic'], [makeVehicle()]);
    expect(results).toHaveLength(0);
  });

  it('matches a line to the highest-scoring vehicle', () => {
    const vehicles = [
      makeVehicle({ id: '1', make: 'Toyota', model: '86' }),
      makeVehicle({ id: '2', make: 'Volkswagen', model: 'Golf' }),
    ];
    const results = matchingService.match(['toyota 86'], vehicles);
    expect(results[0].vehicleId).toBe('1');
  });

  it('returns the original input string in the result', () => {
    const results = matchingService.match(['Toyota 86 GT Manual Petrol'], [makeVehicle()]);
    expect(results[0].input).toBe('Toyota 86 GT Manual Petrol');
  });

  it('full match returns confidence 10', () => {
    const results = matchingService.match(['toyota 86 gt manual petrol rear wheel drive'], [makeVehicle()]);
    expect(results[0].confidence).toBe(10);
  });

  it('make-only match returns confidence 3', () => {
    const results = matchingService.match(['toyota'], [makeVehicle()]);
    expect(results[0].confidence).toBe(3);
  });

  it('produces one result per matched line', () => {
    const results = matchingService.match(['toyota', 'toyota 86'], [makeVehicle()]);
    expect(results).toHaveLength(2);
  });

  describe('tiebreaking', () => {
    it('prefers vehicle whose make appears in the input when scores are equal', () => {
      const toyota = makeVehicle({ id: 'toyota', make: 'Toyota', model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const honda  = makeVehicle({ id: 'honda',  make: 'Honda',  model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const results = matchingService.match(['toyota 86 petrol manual rear wheel drive'], [honda, toyota]);
      expect(results[0].vehicleId).toBe('toyota');
    });

    it('prefers vehicle with higher badge overlap when scores are equal', () => {
      const withBadge    = makeVehicle({ id: 'with-badge',    make: 'Toyota', model: '86', badge: 'GT',  listing_count: 1 });
      const withoutBadge = makeVehicle({ id: 'without-badge', make: 'Toyota', model: '86', badge: 'GTS', listing_count: 1 });
      const results = matchingService.match(['toyota 86 gt manual petrol rear wheel drive'], [withoutBadge, withBadge]);
      expect(results[0].vehicleId).toBe('with-badge');
    });

    it('falls back to listing_count when all else is equal', () => {
      const popular = makeVehicle({ id: 'popular', listing_count: 10 });
      const rare    = makeVehicle({ id: 'rare',    listing_count: 1  });
      const results = matchingService.match(['toyota 86 gt manual petrol rear wheel drive'], [rare, popular]);
      expect(results[0].vehicleId).toBe('popular');
    });
  });
});
