import { SwarmRelay } from './swarm-relay.js';
import { ConnectionState } from './types.js';
import { SwarmRelayError } from './errors.js';
import { MockTransportAdapter } from './testing/mock-transport-adapter.js';

type TestEvents = {
  'user:login': { userId: string };
  'user:logout': { reason: string };
  'data:update': { key: string; value: number };
};

function createSilentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('SwarmRelay', () => {
  let transport: MockTransportAdapter<TestEvents>;
  let relay: SwarmRelay<TestEvents>;

  beforeEach(() => {
    transport = new MockTransportAdapter<TestEvents>();
    relay = new SwarmRelay<TestEvents>({
      clientId: 'test-app',
      transport,
      logger: createSilentLogger(),
    });
  });

  // ── Lifecycle ────────────────────────────────────────────

  describe('connect', () => {
    it('should connect successfully', async () => {
      await relay.connect();
      expect(relay.state).toBe(ConnectionState.Connected);
      expect(transport.connectCalled).toBe(true);
    });

    it('should be a no-op when already connected', async () => {
      await relay.connect();
      await relay.connect(); // second call
      expect(relay.state).toBe(ConnectionState.Connected);
    });

    it('should throw SwarmRelayError on connection failure', async () => {
      transport.connectError = new Error('Connection refused');
      await expect(relay.connect()).rejects.toThrow(SwarmRelayError);
      expect(relay.state).toBe(ConnectionState.Error);
    });

    it('should invoke onStateChange during connection', async () => {
      const onStateChange = vi.fn();
      relay = new SwarmRelay<TestEvents>({
        clientId: 'test-app',
        transport,
        onStateChange,
        logger: createSilentLogger(),
      });

      await relay.connect();
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.Connecting);
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.Connected);
    });

    it('should invoke onError on connection failure', async () => {
      const onError = vi.fn();
      relay = new SwarmRelay<TestEvents>({
        clientId: 'test-app',
        transport,
        onError,
        logger: createSilentLogger(),
      });

      transport.connectError = new Error('fail');
      await expect(relay.connect()).rejects.toThrow();
      expect(onError).toHaveBeenCalledWith(expect.any(SwarmRelayError));
    });
  });

  describe('disconnect', () => {
    it('should disconnect an active connection', async () => {
      await relay.connect();
      relay.disconnect();
      expect(relay.state).toBe(ConnectionState.Disconnected);
      expect(transport.disconnectCalled).toBe(true);
    });

    it('should be a no-op when already disconnected', () => {
      relay.disconnect();
      expect(transport.disconnectCalled).toBe(false);
    });

    it('should clear all handlers on disconnect', async () => {
      await relay.connect();
      const handler = vi.fn();
      relay.on('user:login', handler);
      relay.disconnect();

      // Simulate a message after disconnect — handler must not fire
      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── Sending ──────────────────────────────────────────────

  describe('send', () => {
    it('should send a targeted message', async () => {
      await relay.connect();
      relay.send('other-app', 'user:login', { userId: 'u123' });

      expect(transport.sentMessages).toHaveLength(1);
      const msg = transport.sentMessages[0];
      expect(msg.source).toBe('test-app');
      expect(msg.target).toBe('other-app');
      expect(msg.event).toBe('user:login');
      expect(msg.payload).toEqual({ userId: 'u123' });
      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeTypeOf('number');
    });

    it('should throw when not connected', () => {
      expect(() => relay.send('other', 'user:login', { userId: 'u1' })).toThrow(
        SwarmRelayError
      );
    });
  });

  describe('broadcast', () => {
    it('should broadcast a message without a target', async () => {
      await relay.connect();
      relay.broadcast('data:update', { key: 'score', value: 42 });

      expect(transport.sentMessages).toHaveLength(1);
      const msg = transport.sentMessages[0];
      expect(msg.source).toBe('test-app');
      expect(msg.target).toBeUndefined();
      expect(msg.event).toBe('data:update');
      expect(msg.payload).toEqual({ key: 'score', value: 42 });
    });

    it('should throw when not connected', () => {
      expect(() =>
        relay.broadcast('data:update', { key: 'k', value: 1 })
      ).toThrow(SwarmRelayError);
    });
  });

  // ── Subscribing ──────────────────────────────────────────

  describe('on / off', () => {
    it('should receive messages for subscribed events', async () => {
      await relay.connect();
      const handler = vi.fn();
      relay.on('user:login', handler);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledWith(
        { userId: 'u1' },
        expect.objectContaining({ event: 'user:login' })
      );
    });

    it('should NOT receive messages for other events', async () => {
      await relay.connect();
      const handler = vi.fn();
      relay.on('user:login', handler);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:logout',
        payload: { reason: 'timeout' },
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should unsubscribe via off()', async () => {
      await relay.connect();
      const handler = vi.fn();
      relay.on('user:login', handler);
      relay.off('user:login', handler);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should unsubscribe via the returned cleanup function', async () => {
      await relay.connect();
      const handler = vi.fn();
      const unsubscribe = relay.on('user:login', handler);
      unsubscribe();

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for the same event', async () => {
      await relay.connect();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      relay.on('user:login', handler1);
      relay.on('user:login', handler2);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('onAny / offAny (wildcard)', () => {
    it('should receive all events via a wildcard handler', async () => {
      await relay.connect();
      const wildcard = vi.fn();
      relay.onAny(wildcard);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      transport.simulateMessage({
        id: '2',
        source: 'other',
        event: 'data:update',
        payload: { key: 'k', value: 1 },
        timestamp: Date.now(),
      });

      expect(wildcard).toHaveBeenCalledTimes(2);
      expect(wildcard).toHaveBeenCalledWith(
        'user:login',
        { userId: 'u1' },
        expect.objectContaining({ event: 'user:login' })
      );
      expect(wildcard).toHaveBeenCalledWith(
        'data:update',
        { key: 'k', value: 1 },
        expect.objectContaining({ event: 'data:update' })
      );
    });

    it('should unsubscribe a wildcard handler via the cleanup function', async () => {
      await relay.connect();
      const handler = vi.fn();
      const unsubscribe = relay.onAny(handler);
      unsubscribe();

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should unsubscribe a wildcard handler via offAny()', async () => {
      await relay.connect();
      const handler = vi.fn();
      relay.onAny(handler);
      relay.offAny(handler);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ───────────────────────────────────────

  describe('error handling', () => {
    it('should catch handler errors without breaking other handlers', async () => {
      await relay.connect();
      const badHandler = vi.fn().mockImplementation(() => {
        throw new Error('handler boom');
      });
      const goodHandler = vi.fn();

      relay.on('user:login', badHandler);
      relay.on('user:login', goodHandler);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('should catch wildcard handler errors without breaking event handlers', async () => {
      await relay.connect();
      const badWildcard = vi.fn().mockImplementation(() => {
        throw new Error('wildcard boom');
      });
      const goodHandler = vi.fn();

      relay.onAny(badWildcard);
      relay.on('user:login', goodHandler);

      transport.simulateMessage({
        id: '1',
        source: 'other',
        event: 'user:login',
        payload: { userId: 'u1' },
        timestamp: Date.now(),
      });

      expect(badWildcard).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('should invoke onError when the transport emits an error', async () => {
      const onError = vi.fn();
      relay = new SwarmRelay<TestEvents>({
        clientId: 'test-app',
        transport,
        onError,
        logger: createSilentLogger(),
      });

      await relay.connect();
      transport.simulateError(new Error('transport boom'));
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── Misc ─────────────────────────────────────────────────

  describe('id property', () => {
    it('should return the client ID', () => {
      expect(relay.id).toBe('test-app');
    });
  });
});
