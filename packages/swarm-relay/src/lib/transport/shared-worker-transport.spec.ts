import {
  SharedWorkerTransport,
  __resetSharedBlobUrl__,
} from './shared-worker-transport.js';
import { ConnectionState } from '../types.js';
import { SwarmRelayError, SwarmRelayErrorCode } from '../errors.js';

// ── SharedWorker / MessagePort mocks ───────────────────────

class MockMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  start = vi.fn();
  close = vi.fn();
  postMessage = vi.fn().mockImplementation((data: unknown) => {
    const msg = data as Record<string, unknown>;
    if (msg.type === '__swarm_register__') {
      // Simulate async registration acknowledgement
      queueMicrotask(() => {
        this.onmessage?.({
          data: { type: '__swarm_registered__', clientId: msg.clientId },
        } as MessageEvent);
      });
    }
  });

  /** Test-only: push a message into the port as if it came from the worker. */
  _receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

class MockSharedWorker {
  port: MockMessagePort;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor(public url: string | URL, public options?: WorkerOptions) {
    this.port = new MockMessagePort();
  }
}

// ── Helpers ────────────────────────────────────────────────

let originalSharedWorker: typeof SharedWorker | undefined;

function installSharedWorkerMock(): void {
  originalSharedWorker = globalThis.SharedWorker;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).SharedWorker = MockSharedWorker;
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  globalThis.URL.revokeObjectURL = vi.fn();
}

function restoreSharedWorkerMock(): void {
  if (originalSharedWorker) {
    globalThis.SharedWorker = originalSharedWorker;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).SharedWorker;
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('SharedWorkerTransport', () => {
  beforeEach(() => installSharedWorkerMock());
  afterEach(() => {
    __resetSharedBlobUrl__();
    restoreSharedWorkerMock();
  });

  it('should start in Disconnected state', () => {
    const t = new SharedWorkerTransport();
    expect(t.state).toBe(ConnectionState.Disconnected);
  });

  it('should connect successfully', async () => {
    const t = new SharedWorkerTransport();
    await t.connect('client-1');
    expect(t.state).toBe(ConnectionState.Connected);
  });

  it('should be a no-op when already connected', async () => {
    const t = new SharedWorkerTransport();
    await t.connect('client-1');
    await t.connect('client-1');
    expect(t.state).toBe(ConnectionState.Connected);
  });

  it('should throw when SharedWorker is unsupported', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).SharedWorker;

    const t = new SharedWorkerTransport();
    await expect(t.connect('x')).rejects.toThrow(SwarmRelayError);
    await expect(t.connect('x')).rejects.toMatchObject({
      code: SwarmRelayErrorCode.WorkerNotSupported,
    });

    // Re-install so afterEach cleanup doesn't break
    installSharedWorkerMock();
  });

  it('should disconnect cleanly', async () => {
    const t = new SharedWorkerTransport();
    await t.connect('client-1');
    t.disconnect();
    expect(t.state).toBe(ConnectionState.Disconnected);
  });

  it('should send messages when connected', async () => {
    const t = new SharedWorkerTransport();
    await t.connect('client-1');

    t.send({
      id: '1',
      source: 'client-1',
      target: 'client-2',
      event: 'test',
      payload: { hello: 'world' },
      timestamp: Date.now(),
    });

    // No throw is sufficient; port.postMessage was called.
  });

  it('should throw when sending while disconnected', () => {
    const t = new SharedWorkerTransport();
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

  it('should dispatch incoming messages to registered handlers', async () => {
    const t = new SharedWorkerTransport();
    const handler = vi.fn();
    t.onMessage(handler);

    await t.connect('client-1');

    // Access the internal port to push a message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const port = (t as any).port as MockMessagePort;
    port._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'other',
        event: 'hello',
        payload: { text: 'hi' },
        timestamp: Date.now(),
      },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', event: 'hello' })
    );
  });

  it('should register and unregister message handlers', async () => {
    const t = new SharedWorkerTransport();
    const handler = vi.fn();
    t.onMessage(handler);
    t.offMessage(handler);

    await t.connect('client-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const port = (t as any).port as MockMessagePort;
    port._receive({
      type: '__swarm_message__',
      message: {
        id: 'm1',
        source: 'other',
        event: 'x',
        payload: {},
        timestamp: Date.now(),
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should register and unregister error handlers', () => {
    const t = new SharedWorkerTransport();
    const handler = vi.fn();
    t.onError(handler);
    t.offError(handler);
    // Just verifying no throw — errors are tested via simulateError
  });
});
