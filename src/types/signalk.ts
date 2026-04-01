/**
 * SignalK types for the plugin framework.
 */

export interface SignalKDeltaValue {
  path: string;
  value:
    | { mmsi: number }
    | { longitude: number; latitude: number }
    | { name: string }
    | { registrations: { imo: string } }
    | { communication: { callsignVhf: string } }
    | { current: number; maximum: number }
    | { overall: number }
    | { id: number; name: string | undefined }
    | string
    | number
    | boolean;
}

export interface SignalKDeltaUpdate {
  source: { label: string };
  timestamp: string;
  values: SignalKDeltaValue[];
}

export interface SignalKDelta {
  context: string;
  updates: SignalKDeltaUpdate[];
}

export interface SignalKPositionValue {
  value: {
    longitude: number;
    latitude: number;
  };
}

export interface SignalKPositionUpdate {
  values: SignalKPositionValue[];
}

export interface SignalKPositionDelta {
  updates: SignalKPositionUpdate[];
}

export interface SignalKSubscription {
  context: string;
  subscribe: Array<{ path: string; period: number }>;
}

export interface SignalKApp {
  debug: (msg: string, ...args: string[]) => void;
  error: (msg: string) => void;
  setPluginStatus?: (msg: string) => void;
  setProviderStatus?: (msg: string) => void;
  getSelfPath?: (path: string) => unknown;
  handleMessage: (pluginId: string, delta: SignalKDelta) => void;
  subscriptionmanager: {
    subscribe: (
      subscription: SignalKSubscription,
      unsubscribes: Array<() => void>,
      errorCallback: (error: string) => void,
      deltaCallback: (delta: SignalKPositionDelta) => void,
    ) => void;
  };
}

export interface PluginOptions {
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

export interface SignalKPlugin {
  id: string;
  name: string;
  description: string;
  start: (options: PluginOptions) => void;
  stop: () => void;
  schema: Record<string, unknown>;
}
