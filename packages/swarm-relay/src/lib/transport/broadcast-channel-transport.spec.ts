import { BroadcastChannelTransport } from './broadcast-channel-transport.js';
import { ConnectionState } from '../types.js';
import { SwarmRelayError, SwarmRelayErrorCode } from '../errors.js';

// ── BroadcastChannel mock ──────────────────────────────────

class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  close = vi.fn();
  postMessage = vi.fn();
  constructor(public name: string) {}

  /** Test-only: push a message event. */
  _receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

// ── Helpers ────────────────────────────────────────────────

let originalBC: typeof BroadcastChannel | undefined;

function installMock(): void {
  originalBC = globalThis.BroadcastChannel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;
}

function restoreMock(): void {
  if (originalBC) {
    globalThis.BroadcastChannel = originalBC;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).BroadcastChannel;
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('BroadcastChannelTransport', () => {
  beforeEach(() => installMock());
  afterEach(() => restoreMock());

  it('should start in Disconnected state', () => {
    const t = new BroadcastChannelTransport();
    expect(t.state).toBe(ConnectionState.Disconnected);
  });

  it('should connect successfully', async () => {
    const t = new BroadcastChannelTransport();
    await t.connect('client-1');
    expect(t.state).toBe(ConnectionState.Connected);
  });

  it('should accept a custom channel name', async () => {
    const t = new BroadcastChannelTransport({ channelName: 'custom' });
    await t.connect('client-1');
    expect(t.state).toBe(ConnectionState.Connected);
  });

  it('should be a no-op when already connected', async () => {
    const t = new BroadcastChannelTransport();
    await t.connect('client-1');
    await t.connect('client-1');
    expect(t.state).toBe(ConnectionState.Connected);
  });

  it('should throw when BroadcastChannel is unsupported', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).BroadcastChannel;

    const t = new BroadcastChannelTransport();
    await expect(t.connect('x')).rejects.toThrow(SwarmRelayError);
    await expect(t.connect('x')).rejects.toMatchObject({
      code: SwarmRelayErrorCode.WorkerNotSupported,
    });

    installMock(); // restore for afterEach
  });

  it('should disconnect cleanly', async () => {
    const t = new BroadcastChannelTransport();
    await t.connect('client-1');
    t.disconnect();
    expect(t.state).toBe(ConnectionState.Disconnected);
  });

  it('should send messages when connected', async () => {
    const t = new BroadcastChannelTransport();
    await t.connect('client-1');

    t.send({
      id: '1',
      source: 'client-1',
      event: 'test',
      payload: { hello: 'world' },
      timestamp: Date.now(),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (t as any).channel as MockBroadcastChannel;
    expect(channel.postMessage).toHaveBeenCalled();
  });

  it('should throw when sending while disconnected', () => {
    const t = new BroadcastChannelTransport();
    expect(() =>
      t.send({
        id: '1',
        source: 'x',
        event: 'test',
        payload: {},
        timestamp: Date.now(),
      })
    ).toThrow(SwarmRelayError);
  });

  it('should deliver messages from other clients', async () => {
    const t = new BroadcastChannelTransport();
    const handler = vi.fn();
    t.onMessage(handler);

    await t.connect('client-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (t as any).channel as MockBroadcastChannel;
    channel._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'client-2',
        event: 'hello',
        payload: { text: 'hi' },
        timestamp: Date.now(),
      },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', source: 'client-2' })
    );
  });

  it('should filter out messages from self', async () => {
    const t = new BroadcastChannelTransport();
    const handler = vi.fn();
    t.onMessage(handler);

    await t.connect('client-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (t as any).channel as MockBroadcastChannel;
    channel._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'client-1', // same as connected client
        event: 'hello',
        payload: {},
        timestamp: Date.now(),
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should filter out targeted messages for other clients', async () => {
    const t = new BroadcastChannelTransport();
    const handler = vi.fn();
    t.onMessage(handler);

    await t.connect('client-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (t as any).channel as MockBroadcastChannel;
    channel._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'client-2',
        target: 'client-3', // not us
        event: 'hello',
        payload: {},
        timestamp: Date.now(),
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should deliver targeted messages addressed to this client', async () => {
    const t = new BroadcastChannelTransport();
    const handler = vi.fn();
    t.onMessage(handler);

    await t.connect('client-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (t as any).channel as MockBroadcastChannel;
    channel._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'client-2',
        target: 'client-1', // addressed to us
        event: 'hello',
        payload: { text: 'for you' },
        timestamp: Date.now(),
      },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'client-1' })
    );
  });

  it('should register and unregister handlers', async () => {
    const t = new BroadcastChannelTransport();
    const handler = vi.fn();
    t.onMessage(handler);
    t.offMessage(handler);

    await t.connect('client-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (t as any).channel as MockBroadcastChannel;
    channel._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'client-2',
        event: 'x',
        payload: {},
        timestamp: Date.now(),
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
