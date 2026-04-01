import { describe, it, expect } from 'vitest';
import { navigationalStatus, vesselType, atonType } from '../src/lookups';

describe('navigationalStatus', () => {
  it('maps all 16 status codes (0-15)', () => {
    for (let i = 0; i <= 15; i++) {
      expect(navigationalStatus[i]).toBeDefined();
      expect(typeof navigationalStatus[i]).toBe('string');
    }
  });

  it('has correct key values', () => {
    expect(navigationalStatus[0]).toBe('motoring');
    expect(navigationalStatus[1]).toBe('anchored');
    expect(navigationalStatus[5]).toBe('moored');
    expect(navigationalStatus[7]).toBe('fishing');
    expect(navigationalStatus[8]).toBe('sailing');
    expect(navigationalStatus[14]).toBe('ais-sart');
    expect(navigationalStatus[15]).toBe('default');
  });

  it('returns undefined for unknown keys', () => {
    expect(navigationalStatus[16]).toBeUndefined();
    expect(navigationalStatus[-1]).toBeUndefined();
    expect(navigationalStatus[100]).toBeUndefined();
  });
});

describe('vesselType', () => {
  it('maps expected vessel type codes', () => {
    const expectedKeys = [
      20, 29, 30, 31, 32, 33, 34, 35, 36, 37,
      40, 41, 42, 43, 44, 49,
      50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
      60, 69, 70, 71, 72, 73, 74, 79,
      80, 81, 82, 83, 84, 89,
      90, 91, 92, 93, 94, 99,
    ];
    for (const key of expectedKeys) {
      expect(vesselType[key]).toBeDefined();
      expect(typeof vesselType[key]).toBe('string');
    }
  });

  it('has correct key values', () => {
    expect(vesselType[30]).toBe('Fishing');
    expect(vesselType[37]).toBe('Pleasure');
    expect(vesselType[52]).toBe('Tug');
    expect(vesselType[60]).toBe('Passenger ship');
    expect(vesselType[70]).toBe('Cargo ship');
    expect(vesselType[80]).toBe('Tanker');
    expect(vesselType[90]).toBe('Other');
  });

  it('returns undefined for unmapped codes', () => {
    expect(vesselType[0]).toBeUndefined();
    expect(vesselType[10]).toBeUndefined();
    expect(vesselType[100]).toBeUndefined();
  });
});

describe('atonType', () => {
  it('maps all 32 AtoN type codes (0-31)', () => {
    for (let i = 0; i <= 31; i++) {
      expect(atonType[i]).toBeDefined();
      expect(typeof atonType[i]).toBe('string');
    }
  });

  it('has correct key values', () => {
    expect(atonType[0]).toBe('Unspecified');
    expect(atonType[1]).toBe('Reference Point');
    expect(atonType[2]).toBe('RACON');
    expect(atonType[5]).toBe('Light');
    expect(atonType[9]).toBe('Cardinal N Beacon');
    expect(atonType[20]).toBe('Cardinal Mark N');
    expect(atonType[31]).toBe('Light Vessel/Rig');
  });

  it('returns undefined for out-of-range keys', () => {
    expect(atonType[32]).toBeUndefined();
    expect(atonType[-1]).toBeUndefined();
  });
});
