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

import haversine from 'haversine-distance';
import * as geolib from 'geolib';
import { SignalKApp, SignalKPlugin, PluginOptions } from './types/signalk';
import { AisMessageType } from './types/aisstream';
import { WebSocketManager, BoundingBox } from './websocket-manager';
import { buildSignalKDelta } from './ais-processor';

function toBoundingBox(bounds: { latitude: number; longitude: number }[]): BoundingBox {
  return [
    { latitude: bounds[0].latitude, longitude: bounds[0].longitude },
    { latitude: bounds[1].latitude, longitude: bounds[1].longitude },
  ];
}

function isValidPosition(value: unknown): value is { latitude: number; longitude: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).latitude === 'number' &&
    typeof (value as Record<string, unknown>).longitude === 'number'
  );
}

function createPlugin(app: SignalKApp): SignalKPlugin {
  const plugin: SignalKPlugin = {
    id: 'signalk-aisstream',
    name: 'SignalK AisStream',
    description: 'Track the worlds vessels (AIS) via websocket. Easy to configure and use.',
    start: () => {},
    stop: () => {},
    schema: {},
  };

  const setStatus = app.setPluginStatus
    ? (msg: string) => app.setPluginStatus!(msg)
    : (msg: string) => app.setProviderStatus!(msg);

  let unsubscribes: Array<() => void> = [];
  let oldLon: number | null = null;
  let oldLat: number | null = null;
  let boundingBox: BoundingBox | null = null;
  let wsManager: WebSocketManager | null = null;
  let lastPositionCheck = 0;

  plugin.start = function (options: PluginOptions): void {
    app.debug('AisStream Plugin Started');

    if (!options.apiKey || !options.boundingBoxSize) {
      app.error('Missing required options: apiKey and boundingBoxSize are required.');
      return;
    }

    const distanceLimit =
      options.boundingBoxSize * 1000 * (options.moveRelatedBoundingBox / 100);

    const messageTypes: AisMessageType[] = [];
    if (options.positionReport) messageTypes.push('PositionReport');
    if (options.shipStaticData) messageTypes.push('ShipStaticData');
    if (options.staticDataReport) messageTypes.push('StaticDataReport');
    if (options.standardClassBPositionReport) messageTypes.push('StandardClassBPositionReport');
    if (options.extendedClassBPositionReport) messageTypes.push('ExtendedClassBPositionReport');
    if (options.aidsToNavigationReport) messageTypes.push('AidsToNavigationReport');
    if (options.baseStationReport) messageTypes.push('BaseStationReport');

    wsManager = new WebSocketManager(
      options.apiKey,
      messageTypes,
      options.refreshRate * 1000 + 60000,
      {
        onMessage: (aisMessage) => {
          app.debug('------------------------------------------------------------');
          app.debug(JSON.stringify(aisMessage, null, 2));

          const delta = buildSignalKDelta(aisMessage, plugin.id);
          if (delta) {
            app.debug(JSON.stringify(delta, null, 2));
            app.handleMessage(plugin.id, delta);
          } else {
            app.error('Missing required data: MMSI, longitude, or latitude.');
          }
        },
        onStatus: setStatus,
        onDebug: (msg) => app.debug(msg),
        onError: (msg) => app.error(msg),
      },
    );

    // Attempt immediate start using current position if available
    if (app.getSelfPath && messageTypes.length > 0) {
      const position = app.getSelfPath('navigation.position');
      if (isValidPosition(position)) {
        app.debug('Position available at startup, starting WebSocket immediately');
        oldLon = position.longitude;
        oldLat = position.latitude;
        boundingBox = toBoundingBox(
          geolib.getBoundsOfDistance(
            { lat: position.latitude, lon: position.longitude },
            options.boundingBoxSize * 1000,
          ),
        );
        wsManager.start(boundingBox);
      }
    }

    const localSubscription = {
      context: 'vessels.self',
      subscribe: [
        {
          path: 'navigation.position',
          period: 1000,
        },
      ],
    };

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      (subscriptionError) => {
        app.error('Subscription Error: ' + subscriptionError);
      },
      (delta) => {
        if (!delta || !delta.updates) {
          app.error('Invalid delta received.');
          return;
        }

        delta.updates.forEach((u) => {
          const lon = u.values[0]?.value?.longitude ?? null;
          const lat = u.values[0]?.value?.latitude ?? null;

          if (lon !== null && lat !== null) {
            const now = Date.now();
            const connected = wsManager?.isConnected ?? false;

            // Before initial connection: process immediately
            // After connected: throttle to refreshRate
            if (connected && now - lastPositionCheck < options.refreshRate * 1000) {
              return;
            }
            lastPositionCheck = now;

            if (oldLon === null && oldLat === null && wsManager && !connected && messageTypes.length > 0) {
              oldLon = lon;
              oldLat = lat;
              boundingBox = toBoundingBox(
                geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000),
              );
              wsManager.start(boundingBox);
            }

            const distance = haversine(
              { lat: oldLat ?? lat, lon: oldLon ?? lon },
              { lat, lon },
            );

            if (wsManager && connected && distance > distanceLimit && messageTypes.length > 0) {
              oldLon = lon;
              oldLat = lat;
              boundingBox = toBoundingBox(
                geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000),
              );
              wsManager.updateBoundingBox(boundingBox);
            } else if (wsManager && !connected && !wsManager.isReconnecting && messageTypes.length > 0) {
              boundingBox = toBoundingBox(
                geolib.getBoundsOfDistance({ lat, lon }, options.boundingBoxSize * 1000),
              );
              wsManager.start(boundingBox);
            } else if (messageTypes.length === 0) {
              app.debug('No need to update AIS stream');
            }
          }
        });
      },
    );
  };

  plugin.stop = function (): void {
    unsubscribes.forEach((f) => f());
    unsubscribes = [];

    if (wsManager) {
      wsManager.stop();
      wsManager = null;
    }

    oldLon = null;
    oldLat = null;
    boundingBox = null;
    lastPositionCheck = 0;
    app.debug('AisStream Plugin Stopped');
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
        title:
          'Maximum distance in procents (%) of the bounding box size before the bounding box location renewed',
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
}

module.exports = createPlugin;
