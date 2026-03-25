import { VehicleRepository } from './vehicleRepository';
import { InputService } from './inputReader';
import { MatchingService } from './matchingService';
import { VehicleExpander } from './vehicleExpander';
import { DbService } from './db';

async function main() {
  const dbService = DbService.INST;
  const vehicleRepo = new VehicleRepository();
  const inputService = new InputService();
  const matchingService = new MatchingService(inputService);

  const vehicles = await vehicleRepo.getAllWithListingCount();
  const expander = new VehicleExpander();
  const expanded = expander.expand(vehicles);
  const lines = inputService.readLines();
  const results = matchingService.match(lines, expanded);

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
