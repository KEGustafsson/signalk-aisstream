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

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = 'signalk-aisstream';
  plugin.name = 'SignalK AisStream';
  plugin.description = 'Track the worlds vessels (AIS) via websocket. Easy to configure and use.';

  var unsubscribes = [];
  var utils = require('nmea0183-utilities');
  const haversine = require('haversine-distance');
  const WebSocket = require('ws');
  const geolib = require('geolib');
  const setStatus = app.setPluginStatus || app.setProviderStatus;
  let oldLon;
  let oldLat;
  let boundingBox;
  let socket;
  let watchdogTimer;

  plugin.start = function (options) {
    app.debug("AisStream Plugin Started");
    resetWatchdog();
    const distanceLimit = ((options.boundingBoxSize * 1000) * (options.moveRelatedBoundingBox / 100));

    const messageTypes = [];
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

    const startAisStream = () => {
      socket = new WebSocket("wss://stream.aisstream.io/v0/stream");
      const API_KEY = options.apiKey;
      socket.addEventListener("open", (_) => {
        const subscriptionMessage = {
          APIkey: API_KEY,
          BoundingBoxes: [[
            [boundingBox[0].latitude, boundingBox[0].longitude],
            [boundingBox[1].latitude, boundingBox[1].longitude],
          ]],
          FilterMessageTypes: messageTypes,
        };
        app.debug(JSON.stringify(subscriptionMessage));
        socket.send(JSON.stringify(subscriptionMessage));
      });
      socket.addEventListener("error", (event) => {
      });
      socket.addEventListener("close", (event) => {
      });
      socket.addEventListener("message", (event) => {
        let aisMessage = JSON.parse(event.data);
        sendToSK(aisMessage);
        resetWatchdog();
      });
    };

    const updateAisStream = () => {
      const API_KEY = options.apiKey;
      const subscriptionMessage = {
        APIkey: API_KEY,
        BoundingBoxes: [[
          [boundingBox[0].latitude, boundingBox[0].longitude],
          [boundingBox[1].latitude, boundingBox[1].longitude],
        ]],
        FilterMessageTypes: messageTypes,
      };
      app.debug(JSON.stringify(subscriptionMessage));
      socket.send(JSON.stringify(subscriptionMessage));
    };

    function resetWatchdog() {
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        if (socket) {
          socket.close();
          socket.terminate();
          socket = null;
          app.debug("Watchdog event, websocket connection closed and reconnection will be tried");
        }
      }, options.refreshRate * 1000 + 60000);
    }

    let stateArray = {
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
      15: 'default'
    }

    let vesselArray = {
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
      99: 'Other (no additional information)'
    }

    let aisArray = {
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
      31: 'Light Vessel/Rig'
    }

    const sendToSK = (data) => {
      app.debug("------------------------------------------------------------");
      app.debug('\x1b[34m%s\x1b[0m', JSON.stringify(data, null, 2));
      preContext = 'vessels.urn:mrn:imo:mmsi:';
      const mmsi = data.MetaData.MMSI;
      const longitude = data.MetaData.longitude;
      const latitude = data.MetaData.latitude;
      const cog = data.Message?.PositionReport?.Cog ?? data.Message?.StandardClassBPositionReport?.Cog ?? data.Message?.ExtendedClassBPositionReport?.Cog;
      const sog = data.Message?.PositionReport?.Sog ?? data.Message?.StandardClassBPositionReport?.Sog ?? data.Message?.ExtendedClassBPositionReport?.Sog;
      const rot = data.Message?.PositionReport?.RateOfTurn;
      const heading = data.Message?.PositionReport?.TrueHeading ?? data.Message?.StandardClassBPositionReport?.TrueHeading ?? data.Message?.ExtendedClassBPositionReport?.TrueHeading;
      const time_utc = data.MetaData.time_utc;
      const navigationalStatus = data.Message?.PositionReport?.NavigationalStatus ?? data.Message?.StandardClassBPositionReport?.NavigationalStatus ?? data.Message?.ExtendedClassBPositionReport?.NavigationalStatus;
      let shipName;
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
      const length = data.Message?.ShipStaticData?.Dimension?.A + data.Message?.ShipStaticData?.Dimension?.B;
      const beam = data.Message?.ShipStaticData?.Dimension?.C + data.Message?.ShipStaticData?.Dimension?.D;
      let aisClass;
      if (data.Message.PositionReport || data.Message.ShipStaticData) {
        aisClass = 'A';
      } else if (data.Message.StandardClassBPositionReport || data.Message.ExtendedClassBPositionReport) { 
        aisClass = 'B';
      };
      const datetime = new Date(time_utc).toISOString().replace(/\.\d{3}Z$/, '.000Z')     
      let etaUTC = null;
      if (eta) {
        etaUTC = new Date(time_utc);
        etaUTC.setUTCMonth(etaUTC.getUTCMonth() + parseInt(eta.Month));
        etaUTC.setUTCDate(etaUTC.getUTCDate() + parseInt(eta.Day));
        etaUTC.setUTCHours(etaUTC.getUTCHours() + parseInt(eta.Hour));
        etaUTC.setUTCMinutes(etaUTC.getUTCMinutes() + parseInt(eta.Minute));
      }

      const values = []
      if (mmsi) {
        values.push({
          path: '',
          value: { mmsi },
        })
      }
      if (longitude && latitude) {
        values.push({
          path: 'navigation.position',
          value:  { longitude, latitude },
        })
      }
      if (cog) {
        values.push({
          path: 'navigation.courseOverGroundTrue',
          value: utils.transform(cog, 'deg', 'rad'),
        })
      }
      if (cog) {
        values.push({
          path: 'navigation.courseOverGroundMagnetic',
          value: utils.transform(cog, 'deg', 'rad'),
        })
      }
      if (sog) {
        values.push({
          path: 'navigation.speedOverGround',
          value: utils.transform(sog, 'knots', 'ms'),
        })
      }
      if (rot) {
        values.push({
          path: 'navigation.rateOfTurn',
          value: utils.transform(rot, 'deg', 'rad'),
        })
      }
      if (heading) {
        values.push({
          path: 'navigation.headingTrue',
          value: utils.transform(heading, 'deg', 'rad'),
        })
      }
      if (time_utc) {
        values.push({
          path: 'navigation.datetime',
          value: datetime,
        })
      }
      if (navigationalStatus) {
        values.push({
          path: 'navigation.state',
          value: stateArray[navigationalStatus],
        })
      }
      if (shipName) {
        values.push({
          path: '',
          value: { name: shipName.trim().replace(/\s+/g, ' ') },
        })
      }
      if (destination) {
        values.push({
          path: 'navigation.destination.commonName',
          value: destination.trim().replace(/\s+/g, ' '),
        })
      }
      if (shipType) {
        values.push({
          path: 'design.aisShipType',
          value: { id: shipType, name: vesselArray[shipType] },
        })
      }
      if (imoNumber) {
        values.push({
          path: '',
          value: { registrations: { imo: `IMO ${imoNumber}` } },
        })
      }
      if (callSign) {
        values.push({
          path: '',
          value: { communication: { callsignVhf: callSign.trim().replace(/\s+/g, ' ') } }
        })
      }
      if (etaUTC) {
        values.push({
          path: 'navigation.destination.eta',
          value: etaUTC.toISOString(),
        })
      }
      if (draught) {
        values.push({
          path: 'design.draft',
          value: { "current": draught, "maximum": draught },
        })
      }
      if (length) {
        values.push({
          path: 'design.length',
          value: { "overall": length },
        })
      }
      if (beam) {
        values.push({
          path: 'design.beam',
          value: beam,
        })
      }
      if (!data.Message.SingleSlotBinaryMessage && !data.Message.MultiSlotBinaryMessage) {
        if (data.Message.AidsToNavigationReport) {
          values.push({
            path: 'sensors.ais.class',
            value: 'ATON',
          })
          values.push({
            path: 'atonType',
            value: { id: data.Message.AidsToNavigationReport.Type, name: aisArray[data.Message.AidsToNavigationReport.Type] },
          })
          values.push({
            path: 'virtual',
            value: data.Message.AidsToNavigationReport.VirtualAtoN,
          })
          values.push({
            path: 'offPosition',
            value: data.Message.AidsToNavigationReport.OffPosition,
          })
        } else if (data.Message.BaseStationReport) {
          values.push({
            path: 'sensors.ais.class',
            value: 'BASE',
          })
        } else if (!data.Message.StaticDataReport) {
          values.push({
            path: 'sensors.ais.class',
            value: aisClass,
          })
        }
      }
      
      if (data.MetaData.MMSI) {
        const deltaUpdate = {
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

    let localSubscription = {
      context: `vessels.self`,
      subscribe: [{
        path: 'navigation.position',
        period: options.refreshRate * 1000
      }]
    };

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          const lon = u.values[0].value.longitude || null;
          const lat = u.values[0].value.latitude || null;
          if (lon && lat) {
            if (!oldLon && !oldLat && !socket && messageTypes.length > 0) {
              oldLon = lon;
              oldLat = lat;
              boundingBox = geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000);
              startAisStream();
            }
            const distance = haversine({ lat: oldLat, lon: oldLon }, { lat, lon })
            if (socket && distance > distanceLimit && messageTypes.length > 0) {
              boundingBox = geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000);
              updateAisStream();
            } else if (!socket && messageTypes.length > 0) {
              boundingBox = geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000);
              resetWatchdog();
              startAisStream();
            } else if (messageTypes.length == 0) {
              app.debug("No need to update AIS stream");
            }
          }
        });
      }
    );
  };

  plugin.stop = function stop() {
    unsubscribes.forEach((f) => f());
    unsubscribes = [];
    if (socket) {
      socket.terminate();
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
      },
      boundingBoxSize: {
        type: 'integer',
        default: 1,
        title: 'AIS targets bounding box size around the vessel (in km)',
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
