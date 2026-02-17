import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SwarmRelay } from '../swarm-relay.js';
import {
  ConnectionState,
  type EventMap,
  type SwarmRelayOptions,
} from '../types.js';

/**
 * Value exposed through the SwarmRelay React context.
 */
export interface SwarmRelayContextValue<TEventMap extends EventMap> {
  /** The relay instance, or `null` before initialisation. */
  relay: SwarmRelay<TEventMap> | null;
  /** Current connection state. */
  state: ConnectionState;
  /** Last error that occurred, or `null`. */
  error: Error | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SwarmRelayContext =
  createContext<SwarmRelayContextValue<any> | null>(null);
SwarmRelayContext.displayName = 'SwarmRelayContext';

/**
 * Props for {@link SwarmRelayProvider}.
 */
export interface SwarmRelayProviderProps<TEventMap extends EventMap>
  extends SwarmRelayOptions<TEventMap> {
  children: ReactNode;
  /**
   * Whether to connect automatically when the provider mounts.
   * @default true
   */
  autoConnect?: boolean;
}

/**
 * React context provider that creates and manages a {@link SwarmRelay} instance.
 *
 * @example
 * ```tsx
 * <SwarmRelayProvider<MyEvents> clientId="shell-app">
 *   <App />
 * </SwarmRelayProvider>
 * ```
 */
export function SwarmRelayProvider<TEventMap extends EventMap>({
  children,
  autoConnect = true,
  clientId,
  transport,
  logger,
  onStateChange: externalOnStateChange,
  onError: externalOnError,
}: SwarmRelayProviderProps<TEventMap>) {
  const relayRef = useRef<SwarmRelay<TEventMap> | null>(null);
  const [state, setState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [error, setError] = useState<Error | null>(null);

  // Keep latest callbacks in refs so the relay never goes stale.
  const onStateChangeRef = useRef(externalOnStateChange);
  onStateChangeRef.current = externalOnStateChange;
  const onErrorRef = useRef(externalOnError);
  onErrorRef.current = externalOnError;

  useEffect(() => {
    const relay = new SwarmRelay<TEventMap>({
      clientId,
      transport,
      logger,
      onStateChange: (newState) => {
        setState(newState);
        onStateChangeRef.current?.(newState);
      },
      onError: (err) => {
        setError(err);
        onErrorRef.current?.(err);
      },
    });

    relayRef.current = relay;

    if (autoConnect) {
      relay.connect().catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    }

    return () => {
      relay.disconnect();
      relayRef.current = null;
    };
    // Re-create the relay only when the identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return (
    <SwarmRelayContext value={{ relay: relayRef.current, state, error }}>
      {children}
    </SwarmRelayContext>
  );
}
