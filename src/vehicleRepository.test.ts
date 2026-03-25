import { DbService } from './db';
import { VehicleRepository } from './vehicleRepository';

jest.mock('./db', () => ({
  DbService: {
    INST: {
      query: jest.fn(),
    },
  },
}));

const mockQuery = DbService.INST.query as jest.MockedFunction<typeof DbService.INST.query>;

describe('VehicleRepository.getAllWithListingCount', () => {
  const repo = new VehicleRepository();

  afterEach(() => jest.resetAllMocks());

  it('returns vehicles from the database', async () => {
    const rows = [
      { id: '1', make: 'Toyota', model: '86', badge: 'GT', transmission_type: 'Manual', fuel_type: 'Petrol', drive_type: 'Rear Wheel Drive', listing_count: 3 },
      { id: '2', make: 'Volkswagen', model: 'Golf', badge: '110TSI Comfortline', transmission_type: 'Automatic', fuel_type: 'Petrol', drive_type: 'Front Wheel Drive', listing_count: 1 },
    ];
    mockQuery.mockResolvedValue(rows);

    const result = await repo.getAllWithListingCount();
    expect(result).toEqual(rows);
  });

  it('returns empty array when no vehicles exist', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await repo.getAllWithListingCount();
    expect(result).toEqual([]);
  });

  it('calls query with a SELECT that joins vehicle and listing', async () => {
    mockQuery.mockResolvedValue([]);
    await repo.getAllWithListingCount();

    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/SELECT/i);
    expect(sql).toMatch(/FROM vehicle/i);
    expect(sql).toMatch(/listing/i);
    expect(sql).toMatch(/listing_count/i);
  });

  it('propagates errors from DbService', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    await expect(repo.getAllWithListingCount()).rejects.toThrow('connection refused');
  });
});
