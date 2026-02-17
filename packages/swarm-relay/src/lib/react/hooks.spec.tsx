import { renderHook, act, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { SwarmRelayProvider } from './swarm-relay-context.js';
import { useSwarmRelay } from './use-swarm-relay.js';
import { useSwarmEvent } from './use-swarm-event.js';
import { useSendEvent } from './use-send-event.js';
import { MockTransportAdapter } from '../testing/mock-transport-adapter.js';
import { ConnectionState } from '../types.js';

type TestEvents = {
  'test:event': { message: string };
  'test:other': { count: number };
};

const silentLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('React hooks', () => {
  let transport: MockTransportAdapter<TestEvents>;

  beforeEach(() => {
    transport = new MockTransportAdapter<TestEvents>();
  });

  function createWrapper(overrides?: { autoConnect?: boolean }) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <SwarmRelayProvider<TestEvents>
          clientId="test-app"
          transport={transport}
          autoConnect={overrides?.autoConnect ?? true}
          logger={silentLogger}
        >
          {children}
        </SwarmRelayProvider>
      );
    };
  }

  // ── useSwarmRelay ────────────────────────────────────────

  describe('useSwarmRelay', () => {
    it('should return the relay context after connection', async () => {
      const { result } = renderHook(() => useSwarmRelay<TestEvents>(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.state).toBe(ConnectionState.Connected);
      });

      expect(result.current.relay).not.toBeNull();
    });

    it('should throw when used outside a provider', () => {
      // Suppress expected console.error from React
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useSwarmRelay())).toThrow(
        /useSwarmRelay must be used within a <SwarmRelayProvider>/
      );
      spy.mockRestore();
    });
  });

  // ── useSwarmEvent ────────────────────────────────────────

  describe('useSwarmEvent', () => {
    it('should receive events while mounted', async () => {
      const handler = vi.fn();

      renderHook(
        () => useSwarmEvent<TestEvents, 'test:event'>('test:event', handler),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(transport.connectCalled).toBe(true);
      });

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'test:event',
        payload: { message: 'hello' },
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledWith(
        { message: 'hello' },
        expect.objectContaining({ event: 'test:event' })
      );
    });

    it('should stop receiving events after unmount', async () => {
      const handler = vi.fn();

      const { unmount } = renderHook(
        () => useSwarmEvent<TestEvents, 'test:event'>('test:event', handler),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(transport.connectCalled).toBe(true);
      });

      unmount();

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'test:event',
        payload: { message: 'too late' },
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── useSendEvent ─────────────────────────────────────────

  describe('useSendEvent', () => {
    it('should provide send and broadcast functions', async () => {
      const { result } = renderHook(() => useSendEvent<TestEvents>(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(transport.connectCalled).toBe(true);
      });

      act(() => {
        result.current.broadcast('test:event', { message: 'hi' });
      });

      expect(transport.sentMessages).toHaveLength(1);
      expect(transport.sentMessages[0].event).toBe('test:event');
    });

    it('should send targeted messages', async () => {
      const { result } = renderHook(() => useSendEvent<TestEvents>(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(transport.connectCalled).toBe(true);
      });

      act(() => {
        result.current.send('other-app', 'test:other', { count: 42 });
      });

      expect(transport.sentMessages).toHaveLength(1);
      expect(transport.sentMessages[0].target).toBe('other-app');
      expect(transport.sentMessages[0].payload).toEqual({ count: 42 });
    });
  });
});
