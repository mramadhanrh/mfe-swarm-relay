import {
  ConnectionState,
  type EventMap,
  type SwarmMessage,
  type TransportAdapter,
} from '../types.js';

/**
 * A mock implementation of {@link TransportAdapter} for unit-testing code
 * that depends on SwarmRelay.
 *
 * Provides helpers to simulate incoming messages and transport errors,
 * and records all sent messages for assertions.
 *
 * @example
 * ```typescript
 * const transport = new MockTransportAdapter<MyEvents>();
 * const relay = new SwarmRelay({ clientId: 'test', transport });
 * await relay.connect();
 *
 * // Assert a message was sent
 * relay.broadcast('user:login', { userId: 'u1' });
 * expect(transport.sentMessages).toHaveLength(1);
 *
 * // Simulate an incoming message
 * transport.simulateMessage({
 *   id: '1', source: 'other', event: 'user:login',
 *   payload: { userId: 'u2' }, timestamp: Date.now(),
 * });
 * ```
 */
export class MockTransportAdapter<TEventMap extends EventMap>
  implements TransportAdapter<TEventMap>
{
  private messageHandlers = new Set<
    (message: SwarmMessage<TEventMap>) => void
  >();
  private errorHandlers = new Set<(error: Error) => void>();
  private _state: ConnectionState = ConnectionState.Disconnected;
  private _clientId: string | null = null;

  /** All messages sent through this transport. */
  readonly sentMessages: SwarmMessage<TEventMap>[] = [];
  /** Whether `connect()` was called. */
  connectCalled = false;
  /** Whether `disconnect()` was called. */
  disconnectCalled = false;
  /** If set, `connect()` will reject with this error. */
  connectError: Error | null = null;
  /** If set, `send()` will throw this error. */
  sendError: Error | null = null;

  get state(): ConnectionState {
    return this._state;
  }

  get clientId(): string | null {
    return this._clientId;
  }

  async connect(clientId: string): Promise<void> {
    this.connectCalled = true;
    this._clientId = clientId;

    if (this.connectError) {
      this._state = ConnectionState.Error;
      throw this.connectError;
    }

    this._state = ConnectionState.Connected;
  }

  disconnect(): void {
    this.disconnectCalled = true;
    this._state = ConnectionState.Disconnected;
    this._clientId = null;
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }

  send<K extends keyof TEventMap>(message: SwarmMessage<TEventMap, K>): void {
    if (this.sendError) {
      throw this.sendError;
    }
    this.sentMessages.push(message as SwarmMessage<TEventMap>);
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

  // ── Test helpers ─────────────────────────────────────────

  /** Simulate receiving a message from the transport. */
  simulateMessage(message: SwarmMessage<TEventMap>): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  /** Simulate a transport error. */
  simulateError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  /** Reset all state to initial values. */
  reset(): void {
    this.sentMessages.length = 0;
    this.connectCalled = false;
    this.disconnectCalled = false;
    this.connectError = null;
    this.sendError = null;
    this._state = ConnectionState.Disconnected;
    this._clientId = null;
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }
}
