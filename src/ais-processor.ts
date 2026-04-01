/**
 * AIS message processor — extracts fields from AIS messages,
 * converts units, and builds SignalK delta updates.
 */

import { transform } from 'nmea0183-utilities';
import { AisStreamMessage } from './types/aisstream';
import { SignalKDelta, SignalKDeltaValue } from './types/signalk';
import { navigationalStatus, vesselType, atonType } from './lookups';

const VESSEL_CONTEXT_PREFIX = 'vessels.urn:mrn:imo:mmsi:';
const ATON_CONTEXT_PREFIX = 'atons.urn:mrn:imo:mmsi:';

export function buildSignalKDelta(
  data: AisStreamMessage,
  pluginId: string,
): SignalKDelta | null {
  const mmsi = data.MetaData?.MMSI;
  const longitude = data.MetaData?.longitude;
  const latitude = data.MetaData?.latitude;

  if (!mmsi || !longitude || !latitude) {
    return null;
  }

  const msg = data.Message;

  const cog =
    msg.PositionReport?.Cog ??
    msg.StandardClassBPositionReport?.Cog ??
    msg.ExtendedClassBPositionReport?.Cog;
  const sog =
    msg.PositionReport?.Sog ??
    msg.StandardClassBPositionReport?.Sog ??
    msg.ExtendedClassBPositionReport?.Sog;
  const rot = msg.PositionReport?.RateOfTurn;
  const heading =
    msg.PositionReport?.TrueHeading ??
    msg.StandardClassBPositionReport?.TrueHeading ??
    msg.ExtendedClassBPositionReport?.TrueHeading;
  const timeUtc = data.MetaData.time_utc;
  const navStatus =
    msg.PositionReport?.NavigationalStatus;

  let context: string;
  let shipName: string | undefined;
  if (msg.AidsToNavigationReport) {
    shipName = msg.AidsToNavigationReport.Name;
    context = ATON_CONTEXT_PREFIX + mmsi;
  } else {
    shipName = data.MetaData.ShipName;
    context = VESSEL_CONTEXT_PREFIX + mmsi;
  }

  const shipType = msg.ShipStaticData?.Type;
  const destination =
    msg.ShipStaticData?.Destination ?? msg.StaticDataReport?.ReportB?.CallSign
      ? msg.ShipStaticData?.Destination
      : undefined;
  const imoNumber = msg.ShipStaticData?.ImoNumber;
  const callSign =
    msg.ShipStaticData?.CallSign ?? msg.StaticDataReport?.ReportB?.CallSign;
  const eta = msg.ShipStaticData?.Eta;
  const draught = msg.ShipStaticData?.MaximumStaticDraught;

  const dimensionA = msg.ShipStaticData?.Dimension?.A;
  const dimensionB = msg.ShipStaticData?.Dimension?.B;
  const dimensionC = msg.ShipStaticData?.Dimension?.C;
  const dimensionD = msg.ShipStaticData?.Dimension?.D;
  const length =
    dimensionA !== undefined && dimensionB !== undefined
      ? dimensionA + dimensionB
      : undefined;
  const beam =
    dimensionC !== undefined && dimensionD !== undefined
      ? dimensionC + dimensionD
      : undefined;

  let aisClass: string | undefined;
  if (msg.PositionReport || msg.ShipStaticData) {
    aisClass = 'A';
  } else if (msg.StandardClassBPositionReport || msg.ExtendedClassBPositionReport) {
    aisClass = 'B';
  }

  const datetime = new Date(timeUtc).toISOString().replace(/\.\d{3}Z$/, '.000Z');

  let etaISO: string | undefined;
  if (eta) {
    const etaDate = new Date(timeUtc);
    etaDate.setUTCMonth(etaDate.getUTCMonth() + eta.Month);
    etaDate.setUTCDate(etaDate.getUTCDate() + eta.Day);
    etaDate.setUTCHours(etaDate.getUTCHours() + eta.Hour);
    etaDate.setUTCMinutes(etaDate.getUTCMinutes() + eta.Minute);
    etaISO = etaDate.toISOString();
  }

  const values: SignalKDeltaValue[] = [];

  if (mmsi) {
    values.push({ path: '', value: { mmsi } });
  }

  if (longitude && latitude) {
    values.push({ path: 'navigation.position', value: { longitude, latitude } });
  }

  if (cog) {
    values.push({
      path: 'navigation.courseOverGroundTrue',
      value: transform(cog, 'deg', 'rad'),
    });
    values.push({
      path: 'navigation.courseOverGroundMagnetic',
      value: transform(cog, 'deg', 'rad'),
    });
  }

  if (sog) {
    values.push({
      path: 'navigation.speedOverGround',
      value: transform(sog, 'knots', 'ms'),
    });
  }

  if (rot) {
    values.push({
      path: 'navigation.rateOfTurn',
      value: transform(rot, 'deg', 'rad'),
    });
  }

  if (heading) {
    values.push({
      path: 'navigation.headingTrue',
      value: transform(heading, 'deg', 'rad'),
    });
  }

  if (timeUtc) {
    values.push({ path: 'navigation.datetime', value: datetime });
  }

  if (navStatus !== undefined && navStatus !== null) {
    values.push({
      path: 'navigation.state',
      value: navigationalStatus[navStatus] ?? 'default',
    });
  }

  if (shipName) {
    values.push({
      path: '',
      value: { name: shipName.trim().replace(/\s+/g, ' ') },
    });
  }

  if (destination) {
    values.push({
      path: 'navigation.destination.commonName',
      value: destination.trim().replace(/\s+/g, ' '),
    });
  }

  if (shipType !== undefined && shipType !== null) {
    values.push({
      path: 'design.aisShipType',
      value: { id: shipType, name: vesselType[shipType] },
    });
  }

  if (imoNumber) {
    values.push({
      path: '',
      value: { registrations: { imo: `IMO ${imoNumber}` } },
    });
  }

  if (callSign) {
    values.push({
      path: '',
      value: { communication: { callsignVhf: callSign.trim().replace(/\s+/g, ' ') } },
    });
  }

  if (etaISO) {
    values.push({ path: 'navigation.destination.eta', value: etaISO });
  }

  if (draught) {
    values.push({
      path: 'design.draft',
      value: { current: draught, maximum: draught },
    });
  }

  if (length) {
    values.push({ path: 'design.length', value: { overall: length } });
  }

  if (beam) {
    values.push({ path: 'design.beam', value: beam });
  }

  if (!msg.SingleSlotBinaryMessage && !msg.MultiSlotBinaryMessage) {
    if (msg.AidsToNavigationReport) {
      values.push({ path: 'sensors.ais.class', value: 'ATON' });
      values.push({
        path: 'atonType',
        value: {
          id: msg.AidsToNavigationReport.Type,
          name: atonType[msg.AidsToNavigationReport.Type],
        },
      });
      values.push({ path: 'virtual', value: msg.AidsToNavigationReport.VirtualAtoN });
      values.push({ path: 'offPosition', value: msg.AidsToNavigationReport.OffPosition });
    } else if (msg.BaseStationReport) {
      values.push({ path: 'sensors.ais.class', value: 'BASE' });
    } else if (!msg.StaticDataReport && aisClass) {
      values.push({ path: 'sensors.ais.class', value: aisClass });
    }
  }

  return {
    context,
    updates: [
      {
        source: { label: pluginId },
        timestamp: new Date().toISOString(),
        values,
      },
    ],
  };
}
