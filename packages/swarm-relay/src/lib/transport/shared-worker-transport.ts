import {
  ConnectionState,
  type EventMap,
  type SwarmMessage,
  type TransportAdapter,
} from '../types.js';
import { SwarmRelayError, SwarmRelayErrorCode } from '../errors.js';
import { getWorkerScript } from '../worker/swarm-relay-worker.js';

// ── Singleton SharedWorker Blob URL ────────────────────────
//
// Every SharedWorkerTransport instance must connect to the **same**
// underlying SharedWorker so messages can be routed between clients.
// SharedWorkers are keyed by URL + name — a shared Blob URL guarantees
// all instances hit the same worker global scope.

let sharedBlobUrl: string | null = null;

function getOrCreateBlobUrl(): string {
  if (!sharedBlobUrl) {
    const blob = new Blob([getWorkerScript()], {
      type: 'application/javascript',
    });
    sharedBlobUrl = URL.createObjectURL(blob);
  }
  return sharedBlobUrl;
}

/** @internal Test-only — resets the singleton so each test starts fresh. */
export function __resetSharedBlobUrl__(): void {
  if (sharedBlobUrl) {
    try {
      URL.revokeObjectURL(sharedBlobUrl);
    } catch {
      // May not exist in test environments.
    }
    sharedBlobUrl = null;
  }
}

/**
 * Transport adapter backed by a SharedWorker.
 *
 * The worker script is inlined as a Blob so consumers do not need to
 * configure a separate worker entry point.
 *
 * @example
 * ```typescript
 * const transport = new SharedWorkerTransport<MyEvents>();
 * const relay = new SwarmRelay({ clientId: 'shell', transport });
 * ```
 */
export class SharedWorkerTransport<TEventMap extends EventMap>
  implements TransportAdapter<TEventMap>
{
  private worker: SharedWorker | null = null;
  private port: MessagePort | null = null;
  private messageHandlers = new Set<
    (message: SwarmMessage<TEventMap>) => void
  >();
  private errorHandlers = new Set<(error: Error) => void>();
  private _state: ConnectionState = ConnectionState.Disconnected;
  private handshakeAbort: (() => void) | null = null;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(clientId: string): Promise<void> {
    if (this._state === ConnectionState.Connected) {
      return;
    }

    if (typeof SharedWorker === 'undefined') {
      throw new SwarmRelayError(
        'SharedWorker is not supported in this environment. ' +
          'Consider using BroadcastChannelTransport as a fallback.',
        SwarmRelayErrorCode.WorkerNotSupported
      );
    }

    this._state = ConnectionState.Connecting;

    try {
      const blobUrl = getOrCreateBlobUrl();
      this.worker = new SharedWorker(blobUrl, {
        name: 'swarm-relay-hub',
        type: 'classic',
      });
      this.port = this.worker.port;

      await this.handshake(clientId);

      this._state = ConnectionState.Connected;
    } catch (error) {
      this._state = ConnectionState.Error;
      this.cleanup();

      if (error instanceof SwarmRelayError) {
        throw error;
      }
      throw new SwarmRelayError(
        'Failed to connect to SharedWorker',
        SwarmRelayErrorCode.ConnectionFailed,
        error instanceof Error ? error : undefined
      );
    }
  }

  disconnect(): void {
    // Cancel any in-progress handshake immediately so the pending
    // connect() promise rejects without waiting for the 5 s timeout.
    if (this.handshakeAbort) {
      this.handshakeAbort();
      this.handshakeAbort = null;
    }

    if (this.port) {
      try {
        this.port.postMessage({ type: '__swarm_disconnect__' });
      } catch {
        // Port may already be closed — ignore.
      }
      this.port.close();
    }
    this.cleanup();
    this._state = ConnectionState.Disconnected;
  }

  send<K extends keyof TEventMap>(message: SwarmMessage<TEventMap, K>): void {
    if (this._state !== ConnectionState.Connected || !this.port) {
      throw new SwarmRelayError(
        'Cannot send message: not connected',
        SwarmRelayErrorCode.NotConnected
      );
    }

    try {
      this.port.postMessage({ type: '__swarm_message__', message });
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

  /**
   * Perform the register/ack handshake with the worker.
   * Resolves once the worker confirms registration, or rejects on timeout.
   */
  private handshake(clientId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handshakeAbort = null;
        reject(
          new SwarmRelayError(
            'SharedWorker registration timed out',
            SwarmRelayErrorCode.ConnectionFailed
          )
        );
      }, 5_000);

      // Allow disconnect() to abort the handshake immediately.
      this.handshakeAbort = () => {
        clearTimeout(timeout);
        reject(
          new SwarmRelayError(
            'Connection aborted',
            SwarmRelayErrorCode.ConnectionFailed
          )
        );
      };

      this.port!.onmessage = (event: MessageEvent) => {
        const data = event.data;

        if (data.type === '__swarm_registered__') {
          clearTimeout(timeout);
          this.handshakeAbort = null;
          // Switch to the permanent message handler.
          this.port!.onmessage = this.handlePortMessage;
          resolve();
          return;
        }
      };

      this.port!.onmessageerror = () => {
        this.emitError(
          new SwarmRelayError(
            'Message deserialization error',
            SwarmRelayErrorCode.TransportError
          )
        );
      };

      this.worker!.onerror = (e: ErrorEvent) => {
        clearTimeout(timeout);
        this.handshakeAbort = null;
        const error = new SwarmRelayError(
          `SharedWorker error: ${e.message ?? 'unknown'}`,
          SwarmRelayErrorCode.TransportError
        );
        this._state = ConnectionState.Error;
        reject(error);
      };

      this.port!.start();
      this.port!.postMessage({ type: '__swarm_register__', clientId });
    });
  }

  private handlePortMessage = (event: MessageEvent): void => {
    const data = event.data;
    if (data.type === '__swarm_message__' && data.message) {
      for (const handler of this.messageHandlers) {
        handler(data.message as SwarmMessage<TEventMap>);
      }
    }
  };

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  private cleanup(): void {
    this.port = null;
    this.worker = null;
    // Do NOT revoke the shared blob URL — it is a module-level singleton
    // reused by every SharedWorkerTransport instance.
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }
}
