/**
 * Error codes for SwarmRelay operations.
 */
export enum SwarmRelayErrorCode {
  /** Failed to establish connection to the communication hub. */
  ConnectionFailed = 'CONNECTION_FAILED',
  /** Operation requires an active connection. */
  NotConnected = 'NOT_CONNECTED',
  /** Failed to send a message through the transport. */
  SendFailed = 'SEND_FAILED',
  /** An error occurred in the transport layer. */
  TransportError = 'TRANSPORT_ERROR',
  /** The received message is malformed or invalid. */
  InvalidMessage = 'INVALID_MESSAGE',
  /** SharedWorker or the required API is not supported in this environment. */
  WorkerNotSupported = 'WORKER_NOT_SUPPORTED',
}

/**
 * Custom error class for SwarmRelay operations.
 * Includes an error code for programmatic error handling.
 */
export class SwarmRelayError extends Error {
  override readonly name = 'SwarmRelayError';

  constructor(
    message: string,
    public readonly code: SwarmRelayErrorCode,
    public override readonly cause?: Error
  ) {
    super(message, { cause });
  }
}
