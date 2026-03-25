import * as fs from 'fs';
import * as path from 'path';

export class InputService {
  constructor(private readonly filePath: string = 'inputs.txt') {}

  readLines(): string[] {
    return fs
      .readFileSync(path.join(process.cwd(), this.filePath), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
}
