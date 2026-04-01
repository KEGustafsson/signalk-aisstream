import { describe, it, expect } from 'vitest';
import { buildSignalKDelta } from '../src/ais-processor';
import {
  positionReportMessage,
  shipStaticDataMessage,
  standardClassBMessage,
  extendedClassBMessage,
  staticDataReportMessage,
  aidsToNavigationMessage,
  baseStationMessage,
  missingMmsiMessage,
  anchoredVesselMessage,
  zeroValuesMessage,
  equatorPrimeMeridianMessage,
} from './fixtures/messages';

const PLUGIN_ID = 'signalk-aisstream';

function findValue(
  delta: ReturnType<typeof buildSignalKDelta>,
  path: string,
) {
  if (!delta) return undefined;
  return delta.updates[0].values.find((v) => v.path === path)?.value;
}

describe('buildSignalKDelta', () => {
  describe('missing data handling', () => {
    it('returns null when MMSI is 0 (falsy)', () => {
      expect(buildSignalKDelta(missingMmsiMessage, PLUGIN_ID)).toBeNull();
    });

    it('accepts position at 0,0 (equator/prime meridian)', () => {
      const delta = buildSignalKDelta(equatorPrimeMeridianMessage, PLUGIN_ID);
      expect(delta).not.toBeNull();
      expect(findValue(delta, 'navigation.position')).toEqual({
        longitude: 0,
        latitude: 0,
      });
    });
  });

  describe('PositionReport (Type 1/2/3)', () => {
    it('sets vessel context with MMSI', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      expect(delta?.context).toBe('vessels.urn:mrn:imo:mmsi:211234560');
    });

    it('includes MMSI in root value', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const rootValues = delta?.updates[0].values.filter((v) => v.path === '');
      const mmsiValue = rootValues?.find(
        (v) => typeof v.value === 'object' && v.value !== null && 'mmsi' in v.value,
      );
      expect(mmsiValue?.value).toEqual({ mmsi: 211234560 });
    });

    it('includes position from MetaData', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.position')).toEqual({
        longitude: 11.8365,
        latitude: 57.6721,
      });
    });

    it('converts COG from degrees to radians', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const cog = findValue(delta, 'navigation.courseOverGroundTrue');
      expect(typeof cog).toBe('number');
      // 45 deg ≈ 0.7854 rad
      expect(cog).toBeCloseTo(0.7854, 3);
    });

    it('sets both courseOverGroundTrue and courseOverGroundMagnetic', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const cogTrue = findValue(delta, 'navigation.courseOverGroundTrue');
      const cogMag = findValue(delta, 'navigation.courseOverGroundMagnetic');
      expect(cogTrue).toBe(cogMag);
    });

    it('converts SOG from knots to m/s', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const sog = findValue(delta, 'navigation.speedOverGround');
      expect(typeof sog).toBe('number');
      // 12.5 knots ≈ 6.43 m/s
      expect(sog).toBeCloseTo(6.43, 1);
    });

    it('converts rate of turn from degrees to radians', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const rot = findValue(delta, 'navigation.rateOfTurn');
      expect(typeof rot).toBe('number');
      // 5 deg ≈ 0.0873 rad
      expect(rot).toBeCloseTo(0.0873, 3);
    });

    it('converts heading from degrees to radians', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const heading = findValue(delta, 'navigation.headingTrue');
      expect(typeof heading).toBe('number');
      // 47 deg ≈ 0.8203 rad
      expect(heading).toBeCloseTo(0.8203, 3);
    });

    it('maps navigational status to string', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.state')).toBe('motoring');
    });

    it('sets ais class to A for PositionReport', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBe('A');
    });

    it('includes ship name trimmed and whitespace-normalized', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      const nameValues = delta?.updates[0].values.filter(
        (v) => v.path === '' && typeof v.value === 'object' && v.value !== null && 'name' in v.value,
      );
      expect(nameValues?.[0]?.value).toEqual({ name: 'TEST VESSEL' });
    });

    it('includes datetime from time_utc', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.datetime')).toBe('2024-03-15T12:30:00.000Z');
    });

    it('sets source label to plugin ID', () => {
      const delta = buildSignalKDelta(positionReportMessage, PLUGIN_ID);
      expect(delta?.updates[0].source.label).toBe(PLUGIN_ID);
    });
  });

  describe('anchored vessel (navigational status 1)', () => {
    it('maps navigational status 1 to anchored', () => {
      const delta = buildSignalKDelta(anchoredVesselMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.state')).toBe('anchored');
    });
  });

  describe('ShipStaticData (Type 5)', () => {
    it('includes ship type with id and name', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      expect(findValue(delta, 'design.aisShipType')).toEqual({
        id: 70,
        name: 'Cargo ship',
      });
    });

    it('includes IMO number', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      const regValues = delta?.updates[0].values.filter(
        (v) =>
          v.path === '' &&
          typeof v.value === 'object' &&
          v.value !== null &&
          'registrations' in v.value,
      );
      expect(regValues?.[0]?.value).toEqual({
        registrations: { imo: 'IMO 9123456' },
      });
    });

    it('includes call sign trimmed', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      const csValues = delta?.updates[0].values.filter(
        (v) =>
          v.path === '' &&
          typeof v.value === 'object' &&
          v.value !== null &&
          'communication' in v.value,
      );
      expect(csValues?.[0]?.value).toEqual({
        communication: { callsignVhf: 'DABC' },
      });
    });

    it('includes destination trimmed', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.destination.commonName')).toBe('ROTTERDAM');
    });

    it('includes ETA as ISO string', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      const eta = findValue(delta, 'navigation.destination.eta');
      expect(typeof eta).toBe('string');
      expect(eta).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('includes draught', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      expect(findValue(delta, 'design.draft')).toEqual({
        current: 8.5,
        maximum: 8.5,
      });
    });

    it('includes length (A+B)', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      expect(findValue(delta, 'design.length')).toEqual({ overall: 150 });
    });

    it('includes beam (C+D)', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      expect(findValue(delta, 'design.beam')).toBe(20);
    });

    it('sets ais class to A for ShipStaticData', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBe('A');
    });

    it('normalizes multi-space ship name', () => {
      const delta = buildSignalKDelta(shipStaticDataMessage, PLUGIN_ID);
      const nameValues = delta?.updates[0].values.filter(
        (v) => v.path === '' && typeof v.value === 'object' && v.value !== null && 'name' in v.value,
      );
      expect(nameValues?.[0]?.value).toEqual({ name: 'CARGO KING' });
    });
  });

  describe('StandardClassBPositionReport (Type 18)', () => {
    it('sets ais class to B', () => {
      const delta = buildSignalKDelta(standardClassBMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBe('B');
    });

    it('converts COG for Class B', () => {
      const delta = buildSignalKDelta(standardClassBMessage, PLUGIN_ID);
      const cog = findValue(delta, 'navigation.courseOverGroundTrue');
      // 180 deg ≈ π rad
      expect(cog).toBeCloseTo(Math.PI, 3);
    });

    it('converts SOG for Class B', () => {
      const delta = buildSignalKDelta(standardClassBMessage, PLUGIN_ID);
      const sog = findValue(delta, 'navigation.speedOverGround');
      expect(typeof sog).toBe('number');
      // 6.2 knots ≈ 3.19 m/s
      expect(sog).toBeCloseTo(3.19, 1);
    });

    it('converts heading for Class B', () => {
      const delta = buildSignalKDelta(standardClassBMessage, PLUGIN_ID);
      const heading = findValue(delta, 'navigation.headingTrue');
      expect(typeof heading).toBe('number');
    });
  });

  describe('ExtendedClassBPositionReport (Type 19)', () => {
    it('sets ais class to B', () => {
      const delta = buildSignalKDelta(extendedClassBMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBe('B');
    });

    it('includes position', () => {
      const delta = buildSignalKDelta(extendedClassBMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.position')).toEqual({
        longitude: 18.1,
        latitude: 59.35,
      });
    });
  });

  describe('StaticDataReport (Type 24)', () => {
    it('includes call sign from ReportB', () => {
      const delta = buildSignalKDelta(staticDataReportMessage, PLUGIN_ID);
      const csValues = delta?.updates[0].values.filter(
        (v) =>
          v.path === '' &&
          typeof v.value === 'object' &&
          v.value !== null &&
          'communication' in v.value,
      );
      expect(csValues?.[0]?.value).toEqual({
        communication: { callsignVhf: 'SEFG' },
      });
    });

    it('does not set ais class for StaticDataReport', () => {
      const delta = buildSignalKDelta(staticDataReportMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBeUndefined();
    });
  });

  describe('AidsToNavigationReport (Type 21)', () => {
    it('uses atons context prefix', () => {
      const delta = buildSignalKDelta(aidsToNavigationMessage, PLUGIN_ID);
      expect(delta?.context).toBe('atons.urn:mrn:imo:mmsi:992350001');
    });

    it('uses AtoN name instead of MetaData ShipName', () => {
      const delta = buildSignalKDelta(aidsToNavigationMessage, PLUGIN_ID);
      const nameValues = delta?.updates[0].values.filter(
        (v) => v.path === '' && typeof v.value === 'object' && v.value !== null && 'name' in v.value,
      );
      expect(nameValues?.[0]?.value).toEqual({ name: 'CARDINAL N BEACON NORTH' });
    });

    it('sets ais class to ATON', () => {
      const delta = buildSignalKDelta(aidsToNavigationMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBe('ATON');
    });

    it('includes AtoN type with id and name', () => {
      const delta = buildSignalKDelta(aidsToNavigationMessage, PLUGIN_ID);
      expect(findValue(delta, 'atonType')).toEqual({
        id: 9,
        name: 'Cardinal N Beacon',
      });
    });

    it('includes virtual AtoN flag', () => {
      const delta = buildSignalKDelta(aidsToNavigationMessage, PLUGIN_ID);
      expect(findValue(delta, 'virtual')).toBe(false);
    });

    it('includes off position flag', () => {
      const delta = buildSignalKDelta(aidsToNavigationMessage, PLUGIN_ID);
      expect(findValue(delta, 'offPosition')).toBe(false);
    });
  });

  describe('BaseStationReport (Type 4)', () => {
    it('sets ais class to BASE', () => {
      const delta = buildSignalKDelta(baseStationMessage, PLUGIN_ID);
      expect(findValue(delta, 'sensors.ais.class')).toBe('BASE');
    });

    it('uses vessel context prefix (not atons)', () => {
      const delta = buildSignalKDelta(baseStationMessage, PLUGIN_ID);
      expect(delta?.context).toBe('vessels.urn:mrn:imo:mmsi:2190001');
    });
  });

  describe('zero-value edge cases', () => {
    it('includes COG=0 (due north)', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      const cog = findValue(delta, 'navigation.courseOverGroundTrue');
      expect(cog).toBe(0);
    });

    it('includes SOG=0 (at rest)', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      const sog = findValue(delta, 'navigation.speedOverGround');
      expect(sog).toBe(0);
    });

    it('includes heading=0 (due north)', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      const heading = findValue(delta, 'navigation.headingTrue');
      expect(heading).toBe(0);
    });

    it('includes ROT=0 (no turn)', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      const rot = findValue(delta, 'navigation.rateOfTurn');
      expect(rot).toBe(0);
    });

    it('maps navigational status 0 to motoring', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.state')).toBe('motoring');
    });

    it('always includes MMSI in delta (no longer conditional)', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      const rootValues = delta?.updates[0].values.filter(
        (v) => v.path === '' && typeof v.value === 'object' && v.value !== null && 'mmsi' in v.value,
      );
      expect(rootValues?.length).toBe(1);
    });

    it('always includes position in delta (no longer conditional)', () => {
      const delta = buildSignalKDelta(zeroValuesMessage, PLUGIN_ID);
      expect(findValue(delta, 'navigation.position')).toEqual({
        longitude: 0.5,
        latitude: 0.5,
      });
    });
  });
});
