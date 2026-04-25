import { describe, expect, it, vi } from 'vitest';
import type {
  PluginOptions,
  SignalKApp,
  SignalKPositionDelta,
} from '../src/types/signalk';
import createPlugin from '../src/index';

function baseOptions(overrides: Partial<PluginOptions> = {}): PluginOptions {
  return {
    apiKey: 'test-api-key',
    boundingBoxSize: 1,
    moveRelatedBoundingBox: 10,
    refreshRate: 60,
    positionReport: true,
    shipStaticData: false,
    staticDataReport: false,
    standardClassBPositionReport: false,
    extendedClassBPositionReport: false,
    aidsToNavigationReport: false,
    baseStationReport: false,
    ...overrides,
  };
}

function createApp(): {
  app: SignalKApp;
  deltaCallback: () => ((delta: SignalKPositionDelta) => void);
  debug: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const debug = vi.fn();
  const error = vi.fn();
  let callback: ((delta: SignalKPositionDelta) => void) | undefined;

  const app: SignalKApp = {
    debug,
    error,
    setPluginStatus: vi.fn(),
    handleMessage: vi.fn(),
    subscriptionmanager: {
      subscribe: vi.fn((_subscription, _unsubscribes, _errorCallback, nextCallback) => {
        callback = nextCallback;
      }),
    },
  };

  return {
    app,
    deltaCallback: () => {
      if (!callback) throw new Error('position subscription was not registered');
      return callback;
    },
    debug,
    error,
  };
}

describe('plugin position subscription', () => {
  it('ignores updates without values instead of throwing', () => {
    const { app, deltaCallback, error } = createApp();
    const plugin = createPlugin(app);

    plugin.start(baseOptions());

    expect(() => deltaCallback()({ updates: [{}] })).not.toThrow();
    expect(error).not.toHaveBeenCalledWith('Invalid delta received.');
  });

  it('finds a valid navigation position without assuming it is the first value', () => {
    const { app, deltaCallback, debug } = createApp();
    const plugin = createPlugin(app);

    plugin.start(baseOptions({ positionReport: false }));

    expect(() => deltaCallback()({
      updates: [
        {
          values: [
            { path: 'navigation.state', value: 'motoring' },
            { path: 'navigation.position', value: { longitude: 24.9, latitude: 60.2 } },
          ],
        },
      ],
    })).not.toThrow();
    expect(debug).toHaveBeenCalledWith('No need to update AIS stream');
  });
});
