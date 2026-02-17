import {
  ConnectionState,
  type EventMap,
  type SwarmMessage,
  type TransportAdapter,
} from '../types.js';
import { SwarmRelayError, SwarmRelayErrorCode } from '../errors.js';
import { getWorkerScript } from '../worker/swarm-relay-worker.js';

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
  private blobUrl: string | null = null;

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
      const blob = new Blob([getWorkerScript()], {
        type: 'text/javascript',
      });
      this.blobUrl = URL.createObjectURL(blob);
      this.worker = new SharedWorker(this.blobUrl, {
        name: 'swarm-relay-hub',
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
        reject(
          new SwarmRelayError(
            'SharedWorker registration timed out',
            SwarmRelayErrorCode.ConnectionFailed
          )
        );
      }, 5_000);

      this.port!.onmessage = (event: MessageEvent) => {
        const data = event.data;

        if (data.type === '__swarm_registered__') {
          clearTimeout(timeout);
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
        const error = new SwarmRelayError(
          `SharedWorker error: ${e.message}`,
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
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.messageHandlers.clear();
    this.errorHandlers.clear();
  }
}
