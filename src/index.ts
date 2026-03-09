/*
MIT License

Copyright (c) 2024 Karl-Erik Gustafsson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// eslint-disable-next-line @typescript-eslint/no-var-requires
const utils = require('nmea0183-utilities');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const haversine = require('haversine-distance');
import WebSocket from 'ws';
import * as geolib from 'geolib';

interface SignalKApp {
  debug: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  setPluginStatus?: (msg: string) => void;
  setProviderStatus?: (msg: string) => void;
  handleMessage: (id: string, delta: DeltaUpdate) => void;
  subscriptionmanager: {
    subscribe: (
      subscription: LocalSubscription,
      unsubscribes: Array<() => void>,
      errorCallback: (err: unknown) => void,
      deltaCallback: (delta: PositionDelta) => void
    ) => void;
  };
}

interface PluginOptions {
  apiKey: string;
  boundingBoxSize: number;
  moveRelatedBoundingBox: number;
  refreshRate: number;
  positionReport: boolean;
  shipStaticData: boolean;
  staticDataReport: boolean;
  standardClassBPositionReport: boolean;
  extendedClassBPositionReport: boolean;
  aidsToNavigationReport: boolean;
  baseStationReport: boolean;
}

interface BoundingBoxPoint {
  latitude: number;
  longitude: number;
}

interface AisEta {
  Month: string | number;
  Day: string | number;
  Hour: string | number;
  Minute: string | number;
}

interface AisDimension {
  A?: number;
  B?: number;
  C?: number;
  D?: number;
}

interface PositionReport {
  Cog?: number;
  Sog?: number;
  RateOfTurn?: number;
  TrueHeading?: number;
  NavigationalStatus?: number;
}

interface ShipStaticData {
  Type?: number;
  Destination?: string;
  ImoNumber?: number;
  CallSign?: string;
  Eta?: AisEta;
  MaximumStaticDraught?: number;
  Dimension?: AisDimension;
}

interface StaticDataReport {
  ReportB?: {
    Destination?: string;
    CallSign?: string;
  };
}

interface AidsToNavigationReport {
  Name?: string;
  Type?: number;
  VirtualAtoN?: boolean;
  OffPosition?: boolean;
}

interface AisMessage {
  MetaData: {
    MMSI?: number;
    longitude?: number;
    latitude?: number;
    time_utc: string;
    ShipName?: string;
  };
  Message: {
    PositionReport?: PositionReport;
    StandardClassBPositionReport?: PositionReport;
    ExtendedClassBPositionReport?: PositionReport;
    ShipStaticData?: ShipStaticData;
    StaticDataReport?: StaticDataReport;
    AidsToNavigationReport?: AidsToNavigationReport;
    BaseStationReport?: object;
    SingleSlotBinaryMessage?: object;
    MultiSlotBinaryMessage?: object;
  };
}

interface DeltaValue {
  path: string;
  value: unknown;
}

interface DeltaUpdate {
  context: string;
  updates: Array<{
    source: { label: string };
    timestamp: string;
    values: DeltaValue[];
  }>;
}

interface LocalSubscription {
  context: string;
  subscribe: Array<{
    path: string;
    period: number;
  }>;
}

interface PositionDelta {
  updates?: Array<{
    values?: Array<{
      value?: {
        longitude?: number;
        latitude?: number;
      };
    }>;
  }>;
}

interface SignalKPlugin {
  id: string;
  name: string;
  description: string;
  start: (options: PluginOptions) => void;
  stop: () => void;
  schema: object;
}

module.exports = function createPlugin(app: SignalKApp): SignalKPlugin {
  const plugin = {} as SignalKPlugin;
  plugin.id = 'signalk-aisstream';
  plugin.name = 'SignalK AisStream';
  plugin.description = 'Track the worlds vessels (AIS) via websocket. Easy to configure and use.';

  const setStatus = app.setPluginStatus || app.setProviderStatus;
  void setStatus; // available for future use
  let unsubscribes: Array<() => void> = [];
  let oldLon: number | null = null;
  let oldLat: number | null = null;
  let boundingBox: BoundingBoxPoint[] | null = null;
  let socket: WebSocket | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 5000;
  const RECONNECT_MAX = 300000;

  const stateArray: Record<number, string> = {
    0: 'motoring',
    1: 'anchored',
    2: 'not under command',
    3: 'restricted manouverability',
    4: 'constrained by draft',
    5: 'moored',
    6: 'aground',
    7: 'fishing',
    8: 'sailing',
    9: 'hazardous material high speed',
    10: 'IMO hazard',
    11: 'power-driven vessel towing astern',
    12: 'power-driven vessel pushing ahead or towing alongside',
    13: 'reserved for future use',
    14: 'ais-sart',
    15: 'default',
  };

  const vesselArray: Record<number, string> = {
    20: 'Wing In Ground',
    29: 'Wing In Ground (no other information)',
    30: 'Fishing',
    31: 'Towing',
    32: 'Towing exceeds 200m or wider than 25m',
    33: 'Engaged in dredging or underwater operations',
    34: 'Engaged in diving operations',
    35: 'Engaged in military operations',
    36: 'Sailing',
    37: 'Pleasure',
    40: 'High speed craft',
    41: 'High speed craft carrying dangerous goods',
    42: 'High speed craft hazard cat B',
    43: 'High speed craft hazard cat C',
    44: 'High speed craft hazard cat D',
    49: 'High speed craft (no additional information)',
    50: 'Pilot vessel',
    51: 'SAR',
    52: 'Tug',
    53: 'Port tender',
    54: 'Anti-pollution',
    55: 'Law enforcement',
    56: 'Spare',
    57: 'Spare #2',
    58: 'Medical',
    59: 'RR Resolution No.1',
    60: 'Passenger ship',
    69: 'Passenger ship (no additional information)',
    70: 'Cargo ship',
    71: 'Cargo ship carrying dangerous goods',
    72: 'Cargo ship hazard cat B',
    73: 'Cargo ship hazard cat C',
    74: 'Cargo ship hazard cat D',
    79: 'Cargo ship (no additional information)',
    80: 'Tanker',
    81: 'Tanker carrying dangerous goods',
    82: 'Tanker hazard cat B',
    83: 'Tanker hazard cat C',
    84: 'Tanker hazard cat D',
    89: 'Tanker (no additional information)',
    90: 'Other',
    91: 'Other carrying dangerous goods',
    92: 'Other hazard cat B',
    93: 'Other hazard cat C',
    94: 'Other hazard cat D',
    99: 'Other (no additional information)',
  };

  const aisArray: Record<number, string> = {
    0: 'Unspecified',
    1: 'Reference Point',
    2: 'RACON',
    3: 'Fixed Structure',
    4: 'Spare',
    5: 'Light',
    6: 'Light w/Sectors',
    7: 'Leading Light Front',
    8: 'Leading Light Rear',
    9: 'Cardinal N Beacon',
    10: 'Cardinal E Beacon',
    11: 'Cardinal S Beacon',
    12: 'Cardinal W Beacon',
    13: 'Beacon, Port Hand',
    14: 'Beacon, Starboard Hand',
    15: 'Beacon, Preferred Channel Port Hand',
    16: 'Beacon, Preferred Channel Starboard Hand',
    17: 'Beacon, Isolated Danger',
    18: 'Beacon, Safe Water',
    19: 'Beacon, Special Mark',
    20: 'Cardinal Mark N',
    21: 'Cardinal Mark E',
    22: 'Cardinal Mark S',
    23: 'Cardinal Mark W',
    24: 'Port Hand Mark',
    25: 'Starboard Hand Mark',
    26: 'Preferred Channel Port Hand',
    27: 'Preferred Channel Starboard Hand',
    28: 'Isolated Danger',
    29: 'Safe Water',
    30: 'Special Mark',
    31: 'Light Vessel/Rig',
  };

  plugin.start = function (options: PluginOptions): void {
    app.debug("AisStream Plugin Started");
    resetWatchdog();
    if (!options.apiKey || !options.boundingBoxSize) {
      app.error("Missing required options: apiKey and boundingBoxSize are required.");
      return;
    }
    const distanceLimit = (options.boundingBoxSize * 1000) * (options.moveRelatedBoundingBox / 100);

    const messageTypes: string[] = [];
    if (options.positionReport) { messageTypes.push("PositionReport"); }
    if (options.shipStaticData) { messageTypes.push("ShipStaticData"); }
    if (options.staticDataReport) { messageTypes.push("StaticDataReport"); }
    if (options.standardClassBPositionReport) { messageTypes.push("StandardClassBPositionReport"); }
    if (options.extendedClassBPositionReport) { messageTypes.push("ExtendedClassBPositionReport"); }
    /*
    if (options.singleSlotBinaryMessage) { messageTypes.push("SingleSlotBinaryMessage"); }
    if (options.multiSlotBinaryMessage) { messageTypes.push("MultiSlotBinaryMessage"); }
    */
    if (options.aidsToNavigationReport) { messageTypes.push("AidsToNavigationReport"); }
    if (options.baseStationReport) { messageTypes.push("BaseStationReport"); }

    const scheduleReconnect = (): void => {
      if (reconnectTimer || !boundingBox || messageTypes.length === 0) return;
      app.debug(`WebSocket reconnecting in ${reconnectDelay / 1000}s...`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!socket && boundingBox && messageTypes.length > 0) {
          startAisStream();
        }
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
    };

    const startAisStream = (): void => {
      socket = new WebSocket("wss://stream.aisstream.io/v0/stream");
      const API_KEY = options.apiKey;

      socket.addEventListener("open", () => {
        const subscriptionMessage = {
          APIkey: API_KEY,
          BoundingBoxes: [[
            [boundingBox![0].latitude, boundingBox![0].longitude],
            [boundingBox![1].latitude, boundingBox![1].longitude],
          ]],
          FilterMessageTypes: messageTypes,
        };
        app.debug("Subscription Message: " + JSON.stringify(subscriptionMessage));
        socket!.send(JSON.stringify(subscriptionMessage));
      });

      socket.addEventListener("error", (event) => {
        app.error("WebSocket error: " + (event as unknown as { message?: string }).message);
        // 'close' will fire after 'error'; reconnect is scheduled there
      });

      socket.addEventListener("close", (event) => {
        app.debug(`WebSocket closed: code=${event.code} wasClean=${event.wasClean} reason=${event.reason || 'none'}`);
        socket = null;
        if (!event.wasClean) {
          scheduleReconnect();
        }
      });

      socket.addEventListener("message", (event) => {
        try {
          const aisMessage: AisMessage = JSON.parse(event.data as string);
          sendToSK(aisMessage);
          resetWatchdog();
          reconnectDelay = 5000; // reset backoff on successful message
        } catch (error) {
          app.error("Error parsing message: " + (error as Error).message);
        }
      });
    };

    const updateAisStream = (): void => {
      const API_KEY = options.apiKey;
      const subscriptionMessage = {
        APIkey: API_KEY,
        BoundingBoxes: [[
          [boundingBox![0].latitude, boundingBox![0].longitude],
          [boundingBox![1].latitude, boundingBox![1].longitude],
        ]],
        FilterMessageTypes: messageTypes,
      };
      app.debug(JSON.stringify(subscriptionMessage));
      socket!.send(JSON.stringify(subscriptionMessage));
    };

    function resetWatchdog(): void {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        if (socket) {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = null;
          reconnectDelay = 5000;
          socket.close();
          (socket as WebSocket & { terminate?: () => void }).terminate?.();
          socket = null;
          app.debug("Watchdog event, websocket connection closed and reconnection will be tried");
        }
      }, options.refreshRate * 1000 + 60000);
    }

    const sendToSK = (data: AisMessage): void => {
      app.debug("------------------------------------------------------------");
      app.debug('\x1b[34m%s\x1b[0m', JSON.stringify(data, null, 2));

      let preContext = 'vessels.urn:mrn:imo:mmsi:';
      const mmsi = data.MetaData?.MMSI;
      const longitude = data.MetaData?.longitude;
      const latitude = data.MetaData?.latitude;

      if (!mmsi || !longitude || !latitude) {
        app.error("Missing required data: MMSI, longitude, or latitude.");
        return;
      }
      const cog = data.Message?.PositionReport?.Cog ?? data.Message?.StandardClassBPositionReport?.Cog ?? data.Message?.ExtendedClassBPositionReport?.Cog;
      const sog = data.Message?.PositionReport?.Sog ?? data.Message?.StandardClassBPositionReport?.Sog ?? data.Message?.ExtendedClassBPositionReport?.Sog;
      const rot = data.Message?.PositionReport?.RateOfTurn;
      const heading = data.Message?.PositionReport?.TrueHeading ?? data.Message?.StandardClassBPositionReport?.TrueHeading ?? data.Message?.ExtendedClassBPositionReport?.TrueHeading;
      const time_utc = data.MetaData.time_utc;
      const navigationalStatus = data.Message?.PositionReport?.NavigationalStatus ?? data.Message?.StandardClassBPositionReport?.NavigationalStatus ?? data.Message?.ExtendedClassBPositionReport?.NavigationalStatus;
      let shipName: string | undefined;
      if (data.Message.AidsToNavigationReport) {
        shipName = data.Message.AidsToNavigationReport.Name;
        preContext = 'atons.urn:mrn:imo:mmsi:';
      } else {
        shipName = data.MetaData.ShipName;
      }
      const shipType = data.Message?.ShipStaticData?.Type;
      const destination = data.Message?.ShipStaticData?.Destination ?? data.Message?.StaticDataReport?.ReportB?.Destination;
      const imoNumber = data.Message?.ShipStaticData?.ImoNumber;
      const callSign = data.Message?.ShipStaticData?.CallSign ?? data.Message?.StaticDataReport?.ReportB?.CallSign;
      const eta = data.Message?.ShipStaticData?.Eta;
      const draught = data.Message?.ShipStaticData?.MaximumStaticDraught;
      const dimA = data.Message?.ShipStaticData?.Dimension?.A ?? 0;
      const dimB = data.Message?.ShipStaticData?.Dimension?.B ?? 0;
      const dimC = data.Message?.ShipStaticData?.Dimension?.C ?? 0;
      const dimD = data.Message?.ShipStaticData?.Dimension?.D ?? 0;
      const length = dimA + dimB;
      const beam = dimC + dimD;
      let aisClass: string | undefined;
      if (data.Message.PositionReport || data.Message.ShipStaticData) {
        aisClass = 'A';
      } else if (data.Message.StandardClassBPositionReport || data.Message.ExtendedClassBPositionReport) {
        aisClass = 'B';
      }
      const datetime = new Date(time_utc).toISOString().replace(/\.\d{3}Z$/, '.000Z');
      let etaUTC: Date | null = null;
      if (eta) {
        etaUTC = new Date(time_utc);
        etaUTC.setUTCMonth(etaUTC.getUTCMonth() + parseInt(String(eta.Month)));
        etaUTC.setUTCDate(etaUTC.getUTCDate() + parseInt(String(eta.Day)));
        etaUTC.setUTCHours(etaUTC.getUTCHours() + parseInt(String(eta.Hour)));
        etaUTC.setUTCMinutes(etaUTC.getUTCMinutes() + parseInt(String(eta.Minute)));
      }

      const values: DeltaValue[] = [];
      if (mmsi) {
        values.push({
          path: '',
          value: { mmsi },
        });
      }
      if (longitude && latitude) {
        values.push({
          path: 'navigation.position',
          value: { longitude, latitude },
        });
      }
      if (cog) {
        values.push({
          path: 'navigation.courseOverGroundTrue',
          value: utils.transform(cog, 'deg', 'rad'),
        });
      }
      if (cog) {
        values.push({
          path: 'navigation.courseOverGroundMagnetic',
          value: utils.transform(cog, 'deg', 'rad'),
        });
      }
      if (sog) {
        values.push({
          path: 'navigation.speedOverGround',
          value: utils.transform(sog, 'knots', 'ms'),
        });
      }
      if (rot) {
        values.push({
          path: 'navigation.rateOfTurn',
          value: utils.transform(rot, 'deg', 'rad'),
        });
      }
      if (heading) {
        values.push({
          path: 'navigation.headingTrue',
          value: utils.transform(heading, 'deg', 'rad'),
        });
      }
      if (time_utc) {
        values.push({
          path: 'navigation.datetime',
          value: datetime,
        });
      }
      if (navigationalStatus !== undefined) {
        values.push({
          path: 'navigation.state',
          value: stateArray[navigationalStatus],
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
      if (shipType) {
        values.push({
          path: 'design.aisShipType',
          value: { id: shipType, name: vesselArray[shipType] },
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
      if (etaUTC) {
        values.push({
          path: 'navigation.destination.eta',
          value: etaUTC.toISOString(),
        });
      }
      if (draught) {
        values.push({
          path: 'design.draft',
          value: { current: draught, maximum: draught },
        });
      }
      if (length) {
        values.push({
          path: 'design.length',
          value: { overall: length },
        });
      }
      if (beam) {
        values.push({
          path: 'design.beam',
          value: beam,
        });
      }
      if (!data.Message.SingleSlotBinaryMessage && !data.Message.MultiSlotBinaryMessage) {
        if (data.Message.AidsToNavigationReport) {
          values.push({
            path: 'sensors.ais.class',
            value: 'ATON',
          });
          values.push({
            path: 'atonType',
            value: { id: data.Message.AidsToNavigationReport.Type, name: aisArray[data.Message.AidsToNavigationReport.Type ?? 0] },
          });
          values.push({
            path: 'virtual',
            value: data.Message.AidsToNavigationReport.VirtualAtoN,
          });
          values.push({
            path: 'offPosition',
            value: data.Message.AidsToNavigationReport.OffPosition,
          });
        } else if (data.Message.BaseStationReport) {
          values.push({
            path: 'sensors.ais.class',
            value: 'BASE',
          });
        } else if (!data.Message.StaticDataReport) {
          values.push({
            path: 'sensors.ais.class',
            value: aisClass,
          });
        }
      }

      if (data.MetaData.MMSI) {
        const deltaUpdate: DeltaUpdate = {
          context: preContext + data.MetaData.MMSI,
          updates: [
            {
              source: { label: plugin.id },
              timestamp: (new Date().toISOString()),
              values: values,
            },
          ],
        };
        app.debug('\x1b[32m%s\x1b[0m', JSON.stringify(deltaUpdate, null, 2));
        app.handleMessage(plugin.id, deltaUpdate);
      }
    };

    const localSubscription: LocalSubscription = {
      context: `vessels.self`,
      subscribe: [{
        path: 'navigation.position',
        period: options.refreshRate * 1000,
      }],
    };

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      (subscriptionError) => {
        app.error('Subscription Error: ' + subscriptionError);
      },
      (delta: PositionDelta) => {
        if (!delta || !delta.updates) {
          app.error("Invalid delta received.");
          return;
        }
        delta.updates.forEach((u) => {
          const lon = u.values?.[0]?.value?.longitude ?? null;
          const lat = u.values?.[0]?.value?.latitude ?? null;

          if (lon && lat) {
            if (!oldLon && !oldLat && !socket && messageTypes.length > 0) {
              oldLon = lon;
              oldLat = lat;
              boundingBox = geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000) as BoundingBoxPoint[];
              startAisStream();
            }
            const distance: number = haversine({ lat: oldLat, lon: oldLon }, { lat, lon });
            if (socket && distance > distanceLimit && messageTypes.length > 0) {
              boundingBox = geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000) as BoundingBoxPoint[];
              updateAisStream();
            } else if (!socket && messageTypes.length > 0) {
              boundingBox = geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000) as BoundingBoxPoint[];
              resetWatchdog();
              startAisStream();
            } else if (messageTypes.length === 0) {
              app.debug("No need to update AIS stream");
            }
          }
        });
      }
    );
  };

  plugin.stop = function stop(): void {
    unsubscribes.forEach((f) => f());
    unsubscribes = [];
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectDelay = 5000;
    if (socket) {
      socket.close(); // Use close instead of terminate for graceful shutdown
    }
    socket = null;
    oldLon = null;
    oldLat = null;
    app.debug("AisStream Plugin Stopped");
  };

  plugin.schema = {
    type: 'object',
    required: ['apiKey', 'boundingBoxSize'],
    properties: {
      apiKey: {
        type: 'string',
        default: 'YOUR_API_KEY',
        title: 'API key for aisstream.io',
        description: 'Enter your API key to access the AIS stream.',
      },
      boundingBoxSize: {
        type: 'integer',
        default: 1,
        title: 'AIS targets bounding box size around the vessel (in km)',
        description: 'Specify the size of the bounding box in kilometers.',
      },
      moveRelatedBoundingBox: {
        type: 'integer',
        default: 10,
        title: 'Maximum distance in procents (%) of the bounding box size before the bounding box location renewed',
      },
      refreshRate: {
        type: 'integer',
        default: 60,
        title: 'How ofter the location is updated (in seconds)',
      },
      positionReport: {
        type: 'boolean',
        default: true,
        title: 'Position Report',
      },
      shipStaticData: {
        type: 'boolean',
        default: true,
        title: 'Ship Static Data Report',
      },
      staticDataReport: {
        type: 'boolean',
        default: true,
        title: 'Static Data Report',
      },
      standardClassBPositionReport: {
        type: 'boolean',
        default: true,
        title: 'Standard Class B Position Report',
      },
      extendedClassBPositionReport: {
        type: 'boolean',
        default: true,
        title: 'Extended Class B Position Report',
      },
      /*
      singleSlotBinaryMessage: {
        type: 'boolean',
        default: true,
        title: 'SingleSlotBinaryMessage',
      },
      multiSlotBinaryMessage: {
        type: 'boolean',
        default: true,
        title: 'MultiSlotBinaryMessage',
      },
      */
      aidsToNavigationReport: {
        type: 'boolean',
        default: true,
        title: 'AidsToNavigationReport',
      },
      baseStationReport: {
        type: 'boolean',
        default: true,
        title: 'BaseStationReport',
      },
    },
  };

  return plugin;
};
