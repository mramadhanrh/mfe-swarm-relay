import { useCallback } from 'react';
import { useSwarmRelay } from './use-swarm-relay.js';
import type { EventMap } from '../types.js';

/**
 * Actions returned by {@link useSendEvent}.
 */
export interface SendEventActions<TEventMap extends EventMap> {
  /**
   * Send a typed message to a specific microfrontend.
   */
  send: <K extends keyof TEventMap & string>(
    target: string,
    event: K,
    payload: TEventMap[K]
  ) => void;
  /**
   * Broadcast a typed message to all connected microfrontends.
   */
  broadcast: <K extends keyof TEventMap & string>(
    event: K,
    payload: TEventMap[K]
  ) => void;
}

/**
 * Returns typed `send` and `broadcast` helpers bound to the current
 * {@link SwarmRelay} instance.
 *
 * @example
 * ```tsx
 * function AddToCart({ item }: { item: CartItem }) {
 *   const { broadcast } = useSendEvent<MyEvents>();
 *
 *   return (
 *     <button onClick={() => broadcast('cart:update', { items: [item], total: item.price })}>
 *       Add
 *     </button>
 *   );
 * }
 * ```
 */
export function useSendEvent<
  TEventMap extends EventMap
>(): SendEventActions<TEventMap> {
  const { relay } = useSwarmRelay<TEventMap>();

  const send = useCallback(
    <K extends keyof TEventMap & string>(
      target: string,
      event: K,
      payload: TEventMap[K]
    ) => {
      if (!relay) {
        throw new Error(
          'SwarmRelay is not initialised. Ensure <SwarmRelayProvider> has mounted and connected.'
        );
      }
      relay.send(target, event, payload);
    },
    [relay]
  );

  const broadcast = useCallback(
    <K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]) => {
      if (!relay) {
        throw new Error(
          'SwarmRelay is not initialised. Ensure <SwarmRelayProvider> has mounted and connected.'
        );
      }
      relay.broadcast(event, payload);
    },
    [relay]
  );

  return { send, broadcast };
}
