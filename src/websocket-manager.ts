/**
 * WebSocket connection manager for aisstream.io.
 * Handles connection lifecycle, subscription updates, reconnection with
 * exponential backoff, and watchdog timeout.
 */

import WebSocket from 'ws';
import { AisStreamMessage, AisMessageType, SubscriptionMessage } from './types/aisstream';

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const HANDSHAKE_TIMEOUT = 30000;
const CONNECT_TIMEOUT_FALLBACK = 32000;
const INITIAL_RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 300000;

export interface BoundingBoxCorner {
  latitude: number;
  longitude: number;
}

export type BoundingBox = [BoundingBoxCorner, BoundingBoxCorner];

export interface WebSocketManagerCallbacks {
  onMessage: (message: AisStreamMessage) => void;
  onStatus: (status: string) => void;
  onDebug: (message: string) => void;
  onError: (message: string) => void;
}

export class WebSocketManager {
  private socket: WebSocket | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number = INITIAL_RECONNECT_DELAY;
  private readonly apiKey: string;
  private readonly messageTypes: AisMessageType[];
  private readonly watchdogTimeout: number;
  private readonly callbacks: WebSocketManagerCallbacks;
  private boundingBox: BoundingBox | null = null;
  private stopped = false;

  constructor(
    apiKey: string,
    messageTypes: AisMessageType[],
    watchdogTimeoutMs: number,
    callbacks: WebSocketManagerCallbacks,
  ) {
    this.apiKey = apiKey;
    this.messageTypes = messageTypes;
    this.watchdogTimeout = watchdogTimeoutMs;
    this.callbacks = callbacks;
  }

  get isConnected(): boolean {
    return this.socket !== null;
  }

  get isReconnecting(): boolean {
    return this.reconnectTimer !== null;
  }

  start(boundingBox: BoundingBox): void {
    this.stopped = false;
    this.boundingBox = boundingBox;
    this.connect();
  }

  updateBoundingBox(boundingBox: BoundingBox): void {
    this.boundingBox = boundingBox;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendSubscription();
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearWatchdog();
    this.clearReconnectTimer();
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    if (this.socket) {
      this.socket.close();
    }
    this.socket = null;
  }

  private connect(): void {
    if (this.stopped || !this.boundingBox || this.messageTypes.length === 0) {
      return;
    }

    this.socket = new WebSocket(AISSTREAM_URL, {
      handshakeTimeout: HANDSHAKE_TIMEOUT,
    });

    this.callbacks.onStatus('Connecting...');

    const connectTimeout = setTimeout(() => {
      if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        this.callbacks.onDebug('WebSocket connection timeout (fallback), retrying...');
        this.socket.terminate();
      }
    }, CONNECT_TIMEOUT_FALLBACK);

    this.socket.addEventListener('open', () => {
      clearTimeout(connectTimeout);
      this.callbacks.onStatus('Connected - waiting for AIS data');
      this.resetWatchdog();
      this.sendSubscription();
    });

    this.socket.addEventListener('error', (event) => {
      this.callbacks.onError('WebSocket error: ' + event.message);
    });

    this.socket.addEventListener('close', (event) => {
      clearTimeout(connectTimeout);
      this.callbacks.onDebug(
        `WebSocket closed: code=${event.code} wasClean=${event.wasClean} reason=${event.reason || 'none'}`,
      );
      this.socket = null;
      if (!event.wasClean && !this.stopped) {
        this.scheduleReconnect();
      }
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const aisMessage = JSON.parse(event.data as string) as AisStreamMessage;
        this.callbacks.onMessage(aisMessage);
        this.resetWatchdog();
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
        this.callbacks.onStatus('Connected');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.callbacks.onError('Error parsing message: ' + errorMessage);
      }
    });
  }

  private sendSubscription(): void {
    if (!this.socket || !this.boundingBox) return;

    const subscription: SubscriptionMessage = {
      APIkey: this.apiKey,
      BoundingBoxes: [[
        [this.boundingBox[0].latitude, this.boundingBox[0].longitude],
        [this.boundingBox[1].latitude, this.boundingBox[1].longitude],
      ]],
      FilterMessageTypes: this.messageTypes,
    };

    this.callbacks.onDebug('Subscription Message: ' + JSON.stringify(subscription));
    this.socket.send(JSON.stringify(subscription));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped || !this.boundingBox || this.messageTypes.length === 0) {
      return;
    }

    const delaySec = this.reconnectDelay / 1000;
    this.callbacks.onDebug(`WebSocket reconnecting in ${delaySec}s...`);
    this.callbacks.onStatus(`Disconnected - reconnecting in ${delaySec}s`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.socket && this.boundingBox && this.messageTypes.length > 0 && !this.stopped) {
        this.connect();
      }
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  private resetWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (this.socket) {
        this.clearReconnectTimer();
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
        this.socket.close();
        this.socket.terminate();
        this.socket = null;
        this.callbacks.onDebug(
          'Watchdog event, websocket connection closed and reconnection will be tried',
        );
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      }
    }, this.watchdogTimeout);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
