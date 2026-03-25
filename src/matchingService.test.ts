import { InputService } from './inputReader';
import { MatchingService } from './matchingService';
import { VehicleRow } from './vehicleRepository';

const inputService = new InputService();
const matchingService = new MatchingService(inputService);

const normalize = (s: string) => inputService.normalize(s);
const fieldMatches = (input: string, field: string) => matchingService.fieldMatches(input, field);
const scoreVehicle = (input: string, v: VehicleRow) => matchingService.scoreVehicle(normalize(input), v);

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

describe('MatchingService.fieldMatches', () => {
  it('matches exact value', () => {
    expect(fieldMatches('petrol', 'petrol')).toBe(true);
  });

  it('matches value as a whole word in a longer input', () => {
    expect(fieldMatches('toyota 86 gt manual petrol rear wheel drive', 'rear wheel drive')).toBe(true);
  });

  it('is case-insensitive (both inputs should be pre-normalized)', () => {
    expect(fieldMatches('volkswagen golf', 'golf')).toBe(true);
  });

  it('does not match partial word — "r" should not match inside "rear"', () => {
    expect(fieldMatches('rear wheel drive', 'r')).toBe(false);
  });

  it('does not match partial word — "gt" should not match inside "gts"', () => {
    expect(fieldMatches('toyota 86 gts manual', 'gt')).toBe(false);
  });

  it('does not match "gts" inside "gts apollo blue" as a full badge', () => {
    // "gts apollo blue" is not present in input that only has "gts"
    expect(fieldMatches('toyota 86 gts manual', 'gts apollo blue')).toBe(false);
  });

  it('returns false for empty field', () => {
    expect(fieldMatches('some input', '')).toBe(false);
  });

  it('matches multi-word field value', () => {
    expect(fieldMatches('volkswagen golf 110tsi comfortline petrol automatic front wheel drive', 'front wheel drive')).toBe(true);
  });

  it('does not match when field value is missing from input', () => {
    expect(fieldMatches('volkswagen golf automatic', 'front wheel drive')).toBe(false);
  });

  it('matches standalone token at start of string', () => {
    expect(fieldMatches('golf gti', 'golf')).toBe(true);
  });

  it('matches standalone token at end of string', () => {
    expect(fieldMatches('volkswagen golf', 'golf')).toBe(true);
  });
});

describe('MatchingService.scoreVehicle', () => {
  it('scores 0 when nothing matches', () => {
    const v = makeVehicle({ make: 'Toyota', model: '86', badge: 'GT', transmission_type: 'Manual', fuel_type: 'Petrol', drive_type: 'Rear Wheel Drive' });
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
    expect(scoreVehicle('toyota 86 gt manual petrol rear wheel drive', v)).toBe(10);
  });

  it('does not score abbreviated drive type (RWD)', () => {
    const v = makeVehicle();
    // "rwd" does not match "rear wheel drive"
    expect(scoreVehicle('toyota 86 gt manual petrol rwd', v)).toBe(9);
  });

  it('does not score abbreviated make (VW)', () => {
    const v = makeVehicle({ make: 'Volkswagen', model: 'Golf', badge: '110TSI Comfortline', transmission_type: 'Automatic', fuel_type: 'Petrol', drive_type: 'Front Wheel Drive' });
    // "vw" does not match "volkswagen"; "110tsi comfortline" badge not in input
    expect(scoreVehicle('vw golf petrol automatic front wheel drive', v)).toBe(5); // model(2)+fuel(1)+trans(1)+drive(1)
  });

  it('scores multi-word badge when fully present', () => {
    const v = makeVehicle({ model: 'Golf', badge: 'Alltrack 132TSI' });
    // model "golf"(2) + badge "alltrack 132tsi"(2) = 4
    expect(scoreVehicle('golf alltrack 132tsi', v)).toBe(4);
  });

  it('does not score multi-word badge when only partial', () => {
    const v = makeVehicle({ make: 'Volkswagen', model: 'Golf', badge: 'Alltrack 132TSI' });
    // "132tsi" alone is not the full badge "alltrack 132tsi"
    // make "volkswagen"(3) + model "golf"(2) = 5, no badge
    expect(scoreVehicle('volkswagen golf 132tsi automatic', v)).toBe(5);
  });
});

describe('MatchingService.match', () => {
  it('returns empty array when no lines given', () => {
    const vehicles = [makeVehicle()];
    expect(matchingService.match([], vehicles)).toEqual([]);
  });

  it('returns empty array when no vehicles given', () => {
    expect(matchingService.match(['toyota 86 gt manual petrol'], [])).toEqual([]);
  });

  it('skips lines that score 0 against all vehicles', () => {
    const vehicles = [makeVehicle()];
    const results = matchingService.match(['honda civic'], vehicles);
    expect(results).toHaveLength(0);
  });

  it('matches a line to the highest-scoring vehicle', () => {
    const vehicles = [
      makeVehicle({ id: '1', make: 'Toyota', model: '86' }),
      makeVehicle({ id: '2', make: 'Volkswagen', model: 'Golf' }),
    ];
    const results = matchingService.match(['toyota 86'], vehicles);
    expect(results).toHaveLength(1);
    expect(results[0].vehicleId).toBe('1');
  });

  it('returns the input string in the result', () => {
    const vehicles = [makeVehicle()];
    const results = matchingService.match(['Toyota 86 GT Manual Petrol'], vehicles);
    expect(results[0].input).toBe('Toyota 86 GT Manual Petrol');
  });

  it('calculates confidence as score/10 rounded (full match = 10)', () => {
    const vehicles = [makeVehicle()];
    const results = matchingService.match(['toyota 86 gt manual petrol rear wheel drive'], vehicles);
    expect(results[0].confidence).toBe(10);
  });

  it('calculates confidence proportionally (make only = 3/10 → 3)', () => {
    const vehicles = [makeVehicle()];
    const results = matchingService.match(['toyota'], vehicles);
    expect(results[0].confidence).toBe(3);
  });

  it('produces one result per matched line', () => {
    const vehicles = [makeVehicle()];
    const results = matchingService.match(['toyota', 'toyota 86'], vehicles);
    expect(results).toHaveLength(2);
  });

  describe('tiebreaking', () => {
    it('prefers vehicle whose make appears in the input when scores are equal', () => {
      const toyota = makeVehicle({ id: 'toyota', make: 'Toyota', model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const honda  = makeVehicle({ id: 'honda',  make: 'Honda',  model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const results = matchingService.match(['toyota 86 petrol manual rear wheel drive'], [honda, toyota]);
      expect(results[0].vehicleId).toBe('toyota');
    });

    it('prefers vehicle with more high-tier (model/badge) matches when scores are equal', () => {
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
