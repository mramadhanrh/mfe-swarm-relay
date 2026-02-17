import { useContext } from 'react';
import {
  SwarmRelayContext,
  type SwarmRelayContextValue,
} from './swarm-relay-context.js';
import type { EventMap } from '../types.js';

/**
 * Access the {@link SwarmRelay} instance and its connection state.
 *
 * Must be used inside a {@link SwarmRelayProvider}.
 *
 * @example
 * ```tsx
 * function StatusBar() {
 *   const { relay, state, error } = useSwarmRelay<MyEvents>();
 *   return <span>{state}</span>;
 * }
 * ```
 */
export function useSwarmRelay<
  TEventMap extends EventMap
>(): SwarmRelayContextValue<TEventMap> {
  const context = useContext(SwarmRelayContext);

  if (!context) {
    throw new Error(
      'useSwarmRelay must be used within a <SwarmRelayProvider>. ' +
        'Wrap your component tree with <SwarmRelayProvider> to use this hook.'
    );
  }

  return context as SwarmRelayContextValue<TEventMap>;
}
