import {
  ConnectionState,
  type EventMap,
  type MessageHandler,
  type SwarmMessage,
  type SwarmRelayLogger,
  type SwarmRelayOptions,
  type TransportAdapter,
  type WildcardHandler,
} from './types.js';
import { SwarmRelayError, SwarmRelayErrorCode } from './errors.js';
import { SharedWorkerTransport } from './transport/shared-worker-transport.js';

/** Default console-based logger. */
const defaultLogger: SwarmRelayLogger = {
  debug: (...args) => console.debug('[SwarmRelay]', ...args),
  info: (...args) => console.info('[SwarmRelay]', ...args),
  warn: (...args) => console.warn('[SwarmRelay]', ...args),
  error: (...args) => console.error('[SwarmRelay]', ...args),
};

/** Generate a unique message identifier. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Core communication hub for microfrontend messaging.
 *
 * Provides strictly-typed, event-driven communication between microfrontends
 * backed by a pluggable transport layer (SharedWorker by default).
 *
 * @typeParam TEventMap - A record mapping event names to their payload types.
 *
 * @example
 * ```typescript
 * type MyEvents = {
 *   'user:login': { userId: string };
 *   'cart:update': { items: string[]; total: number };
 * };
 *
 * const relay = new SwarmRelay<MyEvents>({ clientId: 'shell-app' });
 * await relay.connect();
 *
 * // Strictly-typed subscriptions
 * relay.on('user:login', (payload) => {
 *   console.log(payload.userId); // ✅ typed as string
 * });
 *
 * // Strictly-typed broadcasting
 * relay.broadcast('cart:update', { items: ['item1'], total: 9.99 });
 *
 * // Wildcard handler for logging / devtools
 * relay.onAny((event, payload, message) => {
 *   console.log(`[${message.source}] ${String(event)}`, payload);
 * });
 * ```
 */
export class SwarmRelay<TEventMap extends EventMap> {
  private readonly clientId: string;
  private readonly transport: TransportAdapter<TEventMap>;
  private readonly logger: SwarmRelayLogger;
  private readonly onStateChange?: (state: ConnectionState) => void;
  private readonly onErrorCallback?: (error: Error) => void;

  private readonly handlers = new Map<
    keyof TEventMap,
    Set<MessageHandler<TEventMap>>
  >();
  private readonly wildcardHandlers = new Set<WildcardHandler<TEventMap>>();
  private _state: ConnectionState = ConnectionState.Disconnected;

  constructor(options: SwarmRelayOptions<TEventMap>) {
    this.clientId = options.clientId;
    this.transport =
      options.transport ?? new SharedWorkerTransport<TEventMap>();
    this.logger = options.logger ?? defaultLogger;
    this.onStateChange = options.onStateChange;
    this.onErrorCallback = options.onError;
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this._state;
  }

  /** The client identifier of this relay instance. */
  get id(): string {
    return this.clientId;
  }

  // ── Lifecycle ────────────────────────────────────────────

  /**
   * Connect to the communication hub.
   * Registers this client with the transport and starts listening for messages.
   */
  async connect(): Promise<void> {
    if (this._state === ConnectionState.Connected) {
      this.logger.warn('Already connected');
      return;
    }

    this.setState(ConnectionState.Connecting);
    this.logger.info(`Connecting as "${this.clientId}"…`);

    try {
      this.transport.onMessage(this.handleMessage);
      this.transport.onError(this.handleError);
      await this.transport.connect(this.clientId);
      this.setState(ConnectionState.Connected);
      this.logger.info(`Connected as "${this.clientId}"`);
    } catch (error) {
      this.setState(ConnectionState.Error);
      const relayError =
        error instanceof SwarmRelayError
          ? error
          : new SwarmRelayError(
              'Connection failed',
              SwarmRelayErrorCode.ConnectionFailed,
              error instanceof Error ? error : undefined
            );
      this.logger.error('Connection failed', relayError);
      this.onErrorCallback?.(relayError);
      throw relayError;
    }
  }

  /**
   * Disconnect from the communication hub.
   * Cleans up all handlers and releases transport resources.
   */
  disconnect(): void {
    if (this._state === ConnectionState.Disconnected) {
      return;
    }

    this.logger.info(`Disconnecting "${this.clientId}"…`);
    this.transport.offMessage(this.handleMessage);
    this.transport.offError(this.handleError);
    this.transport.disconnect();
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.setState(ConnectionState.Disconnected);
    this.logger.info(`Disconnected "${this.clientId}"`);
  }

  // ── Sending ──────────────────────────────────────────────

  /**
   * Send a typed message to a specific microfrontend.
   *
   * @param target - Client ID of the target microfrontend.
   * @param event  - Event name (constrained to keys of TEventMap).
   * @param payload - Event payload (type-checked against the event map).
   */
  send<K extends keyof TEventMap & string>(
    target: string,
    event: K,
    payload: TEventMap[K]
  ): void {
    this.assertConnected();

    const message: SwarmMessage<TEventMap, K> = {
      id: generateId(),
      source: this.clientId,
      target,
      event,
      payload,
      timestamp: Date.now(),
    };

    this.logger.debug(`Sending "${event}" to "${target}"`, message);
    this.transport.send(message);
  }

  /**
   * Broadcast a typed message to all connected microfrontends.
   *
   * @param event   - Event name (constrained to keys of TEventMap).
   * @param payload - Event payload (type-checked against the event map).
   */
  broadcast<K extends keyof TEventMap & string>(
    event: K,
    payload: TEventMap[K]
  ): void {
    this.assertConnected();

    const message: SwarmMessage<TEventMap, K> = {
      id: generateId(),
      source: this.clientId,
      event,
      payload,
      timestamp: Date.now(),
    };

    this.logger.debug(`Broadcasting "${event}"`, message);
    this.transport.send(message);
  }

  // ── Subscribing ──────────────────────────────────────────

  /**
   * Subscribe to a specific typed event.
   *
   * @returns A cleanup function that removes this subscription.
   */
  on<K extends keyof TEventMap & string>(
    event: K,
    handler: MessageHandler<TEventMap, K>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as MessageHandler<TEventMap>);
    this.logger.debug(`Subscribed to "${event}"`);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from a specific typed event.
   */
  off<K extends keyof TEventMap & string>(
    event: K,
    handler: MessageHandler<TEventMap, K>
  ): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler as MessageHandler<TEventMap>);
      if (eventHandlers.size === 0) {
        this.handlers.delete(event);
      }
      this.logger.debug(`Unsubscribed from "${event}"`);
    }
  }

  /**
   * Subscribe to **all** events (wildcard).
   * Useful for logging, debugging, and devtools integration.
   *
   * @returns A cleanup function that removes this subscription.
   */
  onAny(handler: WildcardHandler<TEventMap>): () => void {
    this.wildcardHandlers.add(handler);
    this.logger.debug('Subscribed to wildcard (all events)');
    return () => this.offAny(handler);
  }

  /**
   * Unsubscribe a wildcard handler.
   */
  offAny(handler: WildcardHandler<TEventMap>): void {
    this.wildcardHandlers.delete(handler);
    this.logger.debug('Unsubscribed from wildcard (all events)');
  }

  // ── Private ──────────────────────────────────────────────

  private setState(state: ConnectionState): void {
    this._state = state;
    this.onStateChange?.(state);
  }

  private assertConnected(): void {
    if (this._state !== ConnectionState.Connected) {
      throw new SwarmRelayError(
        'Not connected. Call connect() first.',
        SwarmRelayErrorCode.NotConnected
      );
    }
  }

  /**
   * Central message dispatcher — routes incoming messages to
   * wildcard handlers first, then to event-specific handlers.
   */
  private handleMessage = (message: SwarmMessage<TEventMap>): void => {
    this.logger.debug(
      `Received "${String(message.event)}" from "${message.source}"`,
      message
    );

    // 1) Wildcard handlers
    for (const handler of this.wildcardHandlers) {
      try {
        handler(message.event, message.payload, message);
      } catch (error) {
        this.logger.error('Wildcard handler threw', error);
      }
    }

    // 2) Event-specific handlers
    const eventHandlers = this.handlers.get(message.event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          handler(message.payload, message);
        } catch (error) {
          this.logger.error(
            `Handler for "${String(message.event)}" threw`,
            error
          );
        }
      }
    }
  };

  private handleError = (error: Error): void => {
    this.logger.error('Transport error', error);
    this.onErrorCallback?.(error);
  };
}
