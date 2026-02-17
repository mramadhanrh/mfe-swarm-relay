// Core
export { SwarmRelay } from './lib/swarm-relay.js';

// Types
export {
  ConnectionState,
  type EventMap,
  type MessageHandler,
  type SwarmMessage,
  type SwarmRelayLogger,
  type SwarmRelayOptions,
  type TransportAdapter,
  type WildcardHandler,
} from './lib/types.js';

// Errors
export { SwarmRelayError, SwarmRelayErrorCode } from './lib/errors.js';

// Transport adapters
export { SharedWorkerTransport } from './lib/transport/shared-worker-transport.js';
export {
  BroadcastChannelTransport,
  type BroadcastChannelTransportOptions,
} from './lib/transport/broadcast-channel-transport.js';

// React integration
export {
  SwarmRelayProvider,
  SwarmRelayContext,
  type SwarmRelayContextValue,
  type SwarmRelayProviderProps,
} from './lib/react/swarm-relay-context.js';
export { useSwarmRelay } from './lib/react/use-swarm-relay.js';
export { useSwarmEvent } from './lib/react/use-swarm-event.js';
export {
  useSendEvent,
  type SendEventActions,
} from './lib/react/use-send-event.js';

// Testing utilities
export { MockTransportAdapter } from './lib/testing/mock-transport-adapter.js';
