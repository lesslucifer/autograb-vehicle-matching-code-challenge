import { DbService } from "./db";

export interface VehicleRow {
  id: string;
  make: string;
  model: string;
  badge: string;
  transmission_type: string;
  fuel_type: string;
  drive_type: string;
  listing_count: number;
}

export class VehicleRepository {
  get dbService() {
    return DbService.INST
  }

  async getAllWithListingCount(): Promise<VehicleRow[]> {
    return this.dbService.query<VehicleRow>(`
      SELECT v.*, COUNT(l.vehicle_id)::int AS listing_count
      FROM vehicle v
      LEFT JOIN listing l ON l.vehicle_id = v.id
      GROUP BY v.id
    `);
  }
}
