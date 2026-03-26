import { MatchingService } from './matchingService';
import { VehicleRow } from './vehicleRepository';

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

const matchWith = (input: string, vehicles: VehicleRow[]) =>
  new MatchingService(vehicles).match(input);

describe('MatchingService scoring', () => {
  it('scores 0 when nothing matches', () => {
    expect(matchWith('volkswagen golf', [makeVehicle()]).confidence).toBe(0);
  });

  it('scores make only (weight 3)', () => {
    expect(matchWith('toyota', [makeVehicle()]).confidence).toBe(3);
  });

  it('scores make + model (3+2=5)', () => {
    expect(matchWith('toyota 86', [makeVehicle()]).confidence).toBe(5);
  });

  it('scores all fields (max 10)', () => {
    expect(matchWith('toyota 86 gt manual petrol rear wheel drive', [makeVehicle()]).confidence).toBe(10);
  });

  it('expands alias RWD → Rear Wheel Drive', () => {
    expect(matchWith('toyota 86 gt manual petrol rwd', [makeVehicle()]).confidence).toBe(10);
  });

  it('expands alias VW → Volkswagen', () => {
    const v = makeVehicle({ make: 'Volkswagen', model: 'Golf', badge: '110TSI Comfortline', transmission_type: 'Automatic', fuel_type: 'Petrol', drive_type: 'Front Wheel Drive' });
    expect(matchWith('vw golf petrol automatic front wheel drive', [v]).confidence).toBeGreaterThan(5);
  });

  it('partial badge scoring — 1 of 2 badge tokens matches', () => {
    const v = makeVehicle({ model: 'Golf', badge: 'Alltrack 132TSI' });
    expect(matchWith('volkswagen golf 132tsi automatic', [v]).confidence).toBeGreaterThan(2);
  });

  it('full badge match scores higher than partial', () => {
    const v = makeVehicle({ model: 'Golf', badge: 'Alltrack 132TSI' });
    const partial = matchWith('golf 132tsi', [v]).confidence;
    const full = matchWith('golf alltrack 132tsi', [v]).confidence;
    expect(full).toBeGreaterThan(partial);
  });

  it('fuzzy matches typo — Amrok matches Amarok', () => {
    const v = makeVehicle({ make: 'Volkswagen', model: 'Amarok', badge: 'TDI550 Highline', transmission_type: 'Automatic', fuel_type: 'Diesel', drive_type: 'Four Wheel Drive' });
    expect(matchWith('amrok highline 4x4', [v]).confidence).toBeGreaterThan(0);
  });
});

describe('MatchingService.match', () => {
  it('returns no-match result when no vehicles given', () => {
    const result = matchWith('toyota 86', []);
    expect(result.vehicleId).toBe('');
  });

  it('returns no-match when input scores 0 against all vehicles', () => {
    const result = matchWith('honda civic', [makeVehicle()]);
    expect(result.vehicleId).toBe('');
  });

  it('matches a line to the highest-scoring vehicle', () => {
    const vehicles = [
      makeVehicle({ id: '1', make: 'Toyota', model: '86' }),
      makeVehicle({ id: '2', make: 'Volkswagen', model: 'Golf' }),
    ];
    const result = matchWith('toyota 86', vehicles);
    expect(result.vehicleId).toBe('1');
  });

  it('returns the original input string in the result', () => {
    const result = matchWith('Toyota 86 GT Manual Petrol', [makeVehicle()]);
    expect(result.input).toBe('Toyota 86 GT Manual Petrol');
  });

  it('full match returns confidence 10', () => {
    const result = matchWith('toyota 86 gt manual petrol rear wheel drive', [makeVehicle()]);
    expect(result.confidence).toBe(10);
  });

  it('make-only match returns confidence 3', () => {
    const result = matchWith('toyota', [makeVehicle()]);
    expect(result.confidence).toBe(3);
  });

  it('produces one result per matched line when used with map', () => {
    const svc = new MatchingService([makeVehicle()]);
    const results = ['toyota', 'toyota 86'].map((input) => svc.match(input));
    expect(results).toHaveLength(2);
  });

  describe('tiebreaking', () => {
    it('prefers vehicle whose make appears in the input when scores are equal', () => {
      const toyota = makeVehicle({ id: 'toyota', make: 'Toyota', model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const honda  = makeVehicle({ id: 'honda',  make: 'Honda',  model: '86', badge: '', fuel_type: 'Petrol', transmission_type: 'Manual', drive_type: 'Rear Wheel Drive', listing_count: 1 });
      const result = matchWith('toyota 86 petrol manual rear wheel drive', [honda, toyota]);
      expect(result.vehicleId).toBe('toyota');
    });

    it('prefers vehicle with higher badge overlap when scores are equal', () => {
      const withBadge    = makeVehicle({ id: 'with-badge',    make: 'Toyota', model: '86', badge: 'GT',  listing_count: 1 });
      const withoutBadge = makeVehicle({ id: 'without-badge', make: 'Toyota', model: '86', badge: 'GTS', listing_count: 1 });
      const result = matchWith('toyota 86 gt manual petrol rear wheel drive', [withoutBadge, withBadge]);
      expect(result.vehicleId).toBe('with-badge');
    });

    it('falls back to listing_count when all else is equal', () => {
      const popular = makeVehicle({ id: 'popular', listing_count: 10 });
      const rare    = makeVehicle({ id: 'rare',    listing_count: 1  });
      const result = matchWith('toyota 86 gt manual petrol rear wheel drive', [rare, popular]);
      expect(result.vehicleId).toBe('popular');
    });
  });
});
