import {
  ConnectionState,
  type EventMap,
  type SwarmMessage,
  type TransportAdapter,
} from '../types.js';
import { SwarmRelayError, SwarmRelayErrorCode } from '../errors.js';

/**
 * Configuration options for the BroadcastChannel transport.
 */
export interface BroadcastChannelTransportOptions {
  /**
   * Channel name used for communication.
   * All microfrontends using the same channel name can communicate.
   * @default 'swarm-relay'
   */
  channelName?: string;
}

/**
 * Fallback transport adapter backed by the BroadcastChannel API.
 *
 * Use this when SharedWorker is unavailable (e.g. Android WebView, some
 * cross-origin iframes). BroadcastChannel works across same-origin tabs
 * and iframes without requiring a worker.
 *
 * @example
 * ```typescript
 * const transport = new BroadcastChannelTransport<MyEvents>({
 *   channelName: 'my-app-relay',
 * });
 * const relay = new SwarmRelay({ clientId: 'shell', transport });
 * ```
 */
export class BroadcastChannelTransport<TEventMap extends EventMap>
  implements TransportAdapter<TEventMap>
{
  private channel: BroadcastChannel | null = null;
  private clientId: string | null = null;
  private messageHandlers = new Set<
    (message: SwarmMessage<TEventMap>) => void
  >();
  private errorHandlers = new Set<(error: Error) => void>();
  private _state: ConnectionState = ConnectionState.Disconnected;
  private readonly channelName: string;

  constructor(options: BroadcastChannelTransportOptions = {}) {
    this.channelName = options.channelName ?? 'swarm-relay';
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(clientId: string): Promise<void> {
    if (this._state === ConnectionState.Connected) {
      return;
    }

    if (typeof BroadcastChannel === 'undefined') {
      throw new SwarmRelayError(
        'BroadcastChannel is not supported in this environment.',
        SwarmRelayErrorCode.WorkerNotSupported
      );
    }

    this._state = ConnectionState.Connecting;
    this.clientId = clientId;

    try {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = this.handleMessage;
      this.channel.onmessageerror = () => {
        this.emitError(
          new SwarmRelayError(
            'Message deserialization error',
            SwarmRelayErrorCode.TransportError
          )
        );
      };
      this._state = ConnectionState.Connected;
    } catch (error) {
      this._state = ConnectionState.Error;
      throw new SwarmRelayError(
        'Failed to create BroadcastChannel',
        SwarmRelayErrorCode.ConnectionFailed,
        error instanceof Error ? error : undefined
      );
    }
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.clientId = null;
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this._state = ConnectionState.Disconnected;
  }

  send<K extends keyof TEventMap>(message: SwarmMessage<TEventMap, K>): void {
    if (this._state !== ConnectionState.Connected || !this.channel) {
      throw new SwarmRelayError(
        'Cannot send message: not connected',
        SwarmRelayErrorCode.NotConnected
      );
    }

    try {
      this.channel.postMessage({ type: '__swarm_message__', message });
    } catch (error) {
      throw new SwarmRelayError(
        'Failed to send message',
        SwarmRelayErrorCode.SendFailed,
        error instanceof Error ? error : undefined
      );
    }
  }

  onMessage(handler: (message: SwarmMessage<TEventMap>) => void): void {
    this.messageHandlers.add(handler);
  }

  offMessage(handler: (message: SwarmMessage<TEventMap>) => void): void {
    this.messageHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  offError(handler: (error: Error) => void): void {
    this.errorHandlers.delete(handler);
  }

  // ── Private ──────────────────────────────────────────────

  private handleMessage = (event: MessageEvent): void => {
    const data = event.data;

    if (data.type === '__swarm_message__' && data.message) {
      const message = data.message as SwarmMessage<TEventMap>;

      // BroadcastChannel delivers to all tabs including the sender,
      // so filter out messages originating from this client.
      if (message.source === this.clientId) {
        return;
      }

      // If the message is targeted, only deliver if we are the target.
      if (message.target && message.target !== this.clientId) {
        return;
      }

      for (const handler of this.messageHandlers) {
        handler(message);
      }
    }
  };

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }
}
