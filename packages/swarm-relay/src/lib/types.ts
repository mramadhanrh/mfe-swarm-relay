/**
 * Base constraint for event maps.
 * Consumers define their specific event map by extending this.
 *
 * @example
 * ```typescript
 * type MyEvents = {
 *   'user:login': { userId: string; timestamp: number };
 *   'cart:update': { items: string[]; total: number };
 * };
 * ```
 */
export type EventMap = Record<string, unknown>;

/**
 * Connection state of the transport layer.
 */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

/**
 * A typed message envelope sent between microfrontends.
 */
export interface SwarmMessage<
  TEventMap extends EventMap,
  K extends keyof TEventMap = keyof TEventMap
> {
  /** Unique message identifier */
  id: string;
  /** Client ID of the sender */
  source: string;
  /** Client ID of the target (undefined = broadcast) */
  target?: string;
  /** Event name */
  event: K;
  /** Typed payload */
  payload: TEventMap[K];
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Handler function for a specific event.
 */
export type MessageHandler<
  TEventMap extends EventMap,
  K extends keyof TEventMap = keyof TEventMap
> = (payload: TEventMap[K], message: SwarmMessage<TEventMap, K>) => void;

/**
 * Wildcard handler that receives all events.
 * Useful for logging, debugging, and devtools integration.
 */
export type WildcardHandler<TEventMap extends EventMap> = <
  K extends keyof TEventMap
>(
  event: K,
  payload: TEventMap[K],
  message: SwarmMessage<TEventMap, K>
) => void;

/**
 * Logger interface for custom logging integration.
 * Compatible with most logging libraries (winston, pino, console, etc.).
 */
export interface SwarmRelayLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Transport adapter interface that abstracts the underlying communication mechanism.
 * Implement this interface to create custom transports (e.g., WebSocket, postMessage).
 */
export interface TransportAdapter<TEventMap extends EventMap> {
  /** Connect to the communication hub with the given client ID. */
  connect(clientId: string): Promise<void>;
  /** Disconnect from the communication hub and clean up resources. */
  disconnect(): void;
  /** Send a typed message through the transport. */
  send<K extends keyof TEventMap>(message: SwarmMessage<TEventMap, K>): void;
  /** Register a handler for incoming messages. */
  onMessage(handler: (message: SwarmMessage<TEventMap>) => void): void;
  /** Unregister a message handler. */
  offMessage(handler: (message: SwarmMessage<TEventMap>) => void): void;
  /** Register a handler for transport errors. */
  onError(handler: (error: Error) => void): void;
  /** Unregister an error handler. */
  offError(handler: (error: Error) => void): void;
  /** Current connection state. */
  readonly state: ConnectionState;
}

/**
 * Configuration options for the SwarmRelay instance.
 */
export interface SwarmRelayOptions<TEventMap extends EventMap> {
  /** Unique identifier for this microfrontend client. */
  clientId: string;
  /** Transport adapter to use for communication. Defaults to SharedWorkerTransport. */
  transport?: TransportAdapter<TEventMap>;
  /** Custom logger instance. Defaults to console-based logger. */
  logger?: SwarmRelayLogger;
  /** Callback invoked on connection state changes. */
  onStateChange?: (state: ConnectionState) => void;
  /** Callback invoked when errors occur. */
  onError?: (error: Error) => void;
}
