import { VehicleRepository } from './vehicleRepository';
import { InputService } from './inputReader';
import { MatchingService } from './matchingService';
import { DbService } from './db';

async function main() {
  const dbService = DbService.INST;
  const vehicleRepo = new VehicleRepository();
  const inputService = new InputService();
  const matchingService = new MatchingService();

  const vehicles = await vehicleRepo.getAllWithListingCount();
  const precomputed = matchingService.precomputeVehicles(vehicles);
  const lines = inputService.readLines();
  const results = lines.map((input) => matchingService.match(input, precomputed));

  for (const { input, vehicleId, confidence } of results) {
    console.log(`Input: ${input}`);
    console.log(`Vehicle ID: ${vehicleId}`);
    console.log(`Confidence: ${confidence}`);
    console.log();
  }

  await dbService.close();
}

if (require.main === module) {
  main().catch(console.error);
}
