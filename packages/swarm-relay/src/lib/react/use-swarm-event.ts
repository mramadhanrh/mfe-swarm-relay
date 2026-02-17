import { useEffect, useRef } from 'react';
import { useSwarmRelay } from './use-swarm-relay.js';
import type { EventMap, MessageHandler } from '../types.js';

/**
 * Subscribe to a specific SwarmRelay event inside a React component.
 *
 * The handler is kept stable via a ref so callers do not need to memoise it.
 * The subscription is automatically cleaned up when the component unmounts
 * or when the `event` name changes.
 *
 * @param event   - Event name to listen for.
 * @param handler - Callback invoked with the typed payload and full message.
 *
 * @example
 * ```tsx
 * function CartBadge() {
 *   const [count, setCount] = useState(0);
 *
 *   useSwarmEvent<MyEvents, 'cart:update'>('cart:update', (payload) => {
 *     setCount(payload.items.length);
 *   });
 *
 *   return <span>{count}</span>;
 * }
 * ```
 */
export function useSwarmEvent<
  TEventMap extends EventMap,
  K extends keyof TEventMap & string
>(event: K, handler: MessageHandler<TEventMap, K>): void {
  const { relay } = useSwarmRelay<TEventMap>();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!relay) {
      console.warn(
        'useSwarmEvent: SwarmRelay is not initialised. Subscription skipped.',
        { event }
      );
      return;
    }

    const stableHandler: MessageHandler<TEventMap, K> = (payload, message) => {
      handlerRef.current(payload, message);
    };

    console.log(`Subscribing to "${event}"`, { clientId: relay.id });

    return relay.on(event, stableHandler);
  }, [relay, event]);
}
