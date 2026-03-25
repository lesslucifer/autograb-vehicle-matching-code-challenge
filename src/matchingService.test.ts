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
  it('returns no-match result when no vehicles given', () => {
    const result = matchingService.match('toyota 86', []);
    expect(result.vehicleId).toBe('');
  });

  it('returns no-match when input scores 0 against all vehicles', () => {
    const result = matchingService.match('honda civic', [makeVehicle()]);
    expect(result.vehicleId).toBe('');
  });

  it('matches a line to the highest-scoring vehicle', () => {
    const vehicles = [
      makeVehicle({ id: '1', make: 'Toyota', model: '86' }),
      makeVehicle({ id: '2', make: 'Volkswagen', model: 'Golf' }),
    ];
    const result = matchingService.match('toyota 86', vehicles);
    expect(result.vehicleId).toBe('1');
  });

  it('returns the original input string in the result', () => {
    const result = matchingService.match('Toyota 86 GT Manual Petrol', [makeVehicle()]);
    expect(result.input).toBe('Toyota 86 GT Manual Petrol');
  });

  it('full match returns confidence 10', () => {
    const result = matchingService.match('toyota 86 gt manual petrol rear wheel drive', [makeVehicle()]);
    expect(result.confidence).toBe(10);
  });

  it('make-only match returns confidence 3', () => {
    const result = matchingService.match('toyota', [makeVehicle()]);
    expect(result.confidence).toBe(3);
  });

  it('produces one result per matched line when used with map', () => {
    const results = ['toyota', 'toyota 86'].map((input) => matchingService.match(input, [makeVehicle()]));
    expect(results).toHaveLength(2);
  });

  describe('tiebreaking', () => {
    it('prefers vehicle whose make appears in the input when scores are equal', () => {
      const toyota = makeVehicle({ id: 'toyota', make: 'Toyota', model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const honda  = makeVehicle({ id: 'honda',  make: 'Honda',  model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const result = matchingService.match('toyota 86 petrol manual rear wheel drive', [honda, toyota]);
      expect(result.vehicleId).toBe('toyota');
    });

    it('prefers vehicle with higher badge overlap when scores are equal', () => {
      const withBadge    = makeVehicle({ id: 'with-badge',    make: 'Toyota', model: '86', badge: 'GT',  listing_count: 1 });
      const withoutBadge = makeVehicle({ id: 'without-badge', make: 'Toyota', model: '86', badge: 'GTS', listing_count: 1 });
      const result = matchingService.match('toyota 86 gt manual petrol rear wheel drive', [withoutBadge, withBadge]);
      expect(result.vehicleId).toBe('with-badge');
    });

    it('falls back to listing_count when all else is equal', () => {
      const popular = makeVehicle({ id: 'popular', listing_count: 10 });
      const rare    = makeVehicle({ id: 'rare',    listing_count: 1  });
      const result = matchingService.match('toyota 86 gt manual petrol rear wheel drive', [rare, popular]);
      expect(result.vehicleId).toBe('popular');
    });
  });
});
