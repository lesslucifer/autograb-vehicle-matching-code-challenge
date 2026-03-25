import * as fs from 'fs';
import * as path from 'path';
import { InputService } from './inputReader';

jest.mock('fs');
const mockedReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('InputService.normalize', () => {
  const service = new InputService();
  const normalize = (s: string) => service.normalize(s);

  it('lowercases input', () => {
    expect(normalize('Volkswagen')).toBe('volkswagen');
  });

  it('replaces punctuation with spaces', () => {
    expect(normalize('Hybrid-Petrol')).toBe('hybrid petrol');
  });

  it('collapses multiple spaces', () => {
    expect(normalize('Four  Wheel  Drive')).toBe('four wheel drive');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  Golf  ')).toBe('golf');
  });

  it('strips slashes and special chars', () => {
    expect(normalize('h/line 4x4')).toBe('h line 4x4');
  });
});

describe('InputService.readLines', () => {
  afterEach(() => jest.resetAllMocks());

  it('returns lines from the file', () => {
    mockedReadFileSync.mockReturnValue('Toyota 86 GT\nVolkswagen Golf\n');
    const service = new InputService('inputs.txt');
    expect(service.readLines()).toEqual(['Toyota 86 GT', 'Volkswagen Golf']);
  });

  it('trims leading and trailing whitespace from each line', () => {
    mockedReadFileSync.mockReturnValue('  Toyota 86 GT  \n  Volkswagen Golf  \n');
    const service = new InputService('inputs.txt');
    expect(service.readLines()).toEqual(['Toyota 86 GT', 'Volkswagen Golf']);
  });

  it('filters out blank lines', () => {
    mockedReadFileSync.mockReturnValue('Toyota 86 GT\n\n\nVolkswagen Golf\n');
    const service = new InputService('inputs.txt');
    expect(service.readLines()).toEqual(['Toyota 86 GT', 'Volkswagen Golf']);
  });

  it('returns empty array for a file with only blank lines', () => {
    mockedReadFileSync.mockReturnValue('\n\n\n');
    const service = new InputService('inputs.txt');
    expect(service.readLines()).toEqual([]);
  });

  it('returns empty array for an empty file', () => {
    mockedReadFileSync.mockReturnValue('');
    const service = new InputService('inputs.txt');
    expect(service.readLines()).toEqual([]);
  });

  it('reads from the correct path using process.cwd()', () => {
    mockedReadFileSync.mockReturnValue('line\n');
    const service = new InputService('my-inputs.txt');
    service.readLines();
    expect(mockedReadFileSync).toHaveBeenCalledWith(
      path.join(process.cwd(), 'my-inputs.txt'),
      'utf8',
    );
  });

  it('uses inputs.txt as default file path', () => {
    mockedReadFileSync.mockReturnValue('line\n');
    const service = new InputService();
    service.readLines();
    expect(mockedReadFileSync).toHaveBeenCalledWith(
      path.join(process.cwd(), 'inputs.txt'),
      'utf8',
    );
  });
});
