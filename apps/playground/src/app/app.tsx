import { useState } from 'react';
import {
  ConnectionState,
  SwarmRelayProvider,
  useSendEvent,
  useSwarmEvent,
  useSwarmRelay,
} from '@org/swarm-relay';
import type { AppEvents } from './types';

// ── Shared status badge ────────────────────────────────────

function StatusBadge() {
  const { state } = useSwarmRelay<AppEvents>();
  const color =
    state === ConnectionState.Connected
      ? '#4caf50'
      : state === ConnectionState.Connecting
      ? '#ff9800'
      : '#f44336';

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        color: '#fff',
        backgroundColor: color,
      }}
    >
      {state}
    </span>
  );
}

// ── Shell MFE ──────────────────────────────────────────────

function ShellPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const { send, broadcast } = useSendEvent<AppEvents>();

  useSwarmEvent<AppEvents, 'user:login'>('user:login', (payload, message) => {
    setLogs((prev) => [
      ...prev,
      `[user:login] ${payload.displayName} (from ${message.source})`,
    ]);
  });

  useSwarmEvent<AppEvents, 'cart:update'>('cart:update', (payload, message) => {
    setLogs((prev) => [
      ...prev,
      `[cart:update] ${payload.items.length} items, $${payload.total} (from ${message.source})`,
    ]);
  });

  useSwarmEvent<AppEvents, 'notification:show'>(
    'notification:show',
    (payload) => {
      setLogs((prev) => [
        ...prev,
        `[notification] ${payload.severity}: ${payload.message}`,
      ]);
    }
  );

  return (
    <div>
      <h3>
        🏠 Shell App <StatusBadge />
      </h3>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() =>
            broadcast('user:login', { userId: 'u1', displayName: 'Alice' })
          }
        >
          Broadcast Login
        </button>
        <button
          onClick={() =>
            send('cart', 'notification:show', {
              message: 'Welcome back!',
              severity: 'info',
            })
          }
        >
          Send Notification → Cart
        </button>
        <button onClick={() => setLogs([])}>Clear Logs</button>
      </div>

      <EventLog logs={logs} />
    </div>
  );
}

// ── Cart MFE ───────────────────────────────────────────────

function CartPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const { send, broadcast } = useSendEvent<AppEvents>();

  useSwarmEvent<AppEvents, 'user:login'>('user:login', (payload, message) => {
    setLogs((prev) => [
      ...prev,
      `[user:login] ${payload.displayName} (from ${message.source})`,
    ]);
  });

  useSwarmEvent<AppEvents, 'cart:update'>('cart:update', (payload, message) => {
    setLogs((prev) => [
      ...prev,
      `[cart:update] ${payload.items.length} items, $${payload.total} (from ${message.source})`,
    ]);
  });

  useSwarmEvent<AppEvents, 'notification:show'>(
    'notification:show',
    (payload) => {
      setLogs((prev) => [
        ...prev,
        `[notification] ${payload.severity}: ${payload.message}`,
      ]);
    }
  );

  return (
    <div>
      <h3>
        🛒 Cart MFE <StatusBadge />
      </h3>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() =>
            broadcast('cart:update', {
              items: ['item-1', 'item-2'],
              total: 49.99,
            })
          }
        >
          Broadcast Cart Update
        </button>
        <button
          onClick={() =>
            send('shell', 'notification:show', {
              message: 'Cart is ready!',
              severity: 'info',
            })
          }
        >
          Send Notification → Shell
        </button>
        <button onClick={() => setLogs([])}>Clear Logs</button>
      </div>

      <EventLog logs={logs} />
    </div>
  );
}

// ── Shared log viewer ──────────────────────────────────────

function EventLog({ logs }: { logs: string[] }) {
  return (
    <pre
      style={{
        marginTop: 12,
        padding: 12,
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        borderRadius: 6,
        fontSize: 13,
        minHeight: 80,
        maxHeight: 200,
        overflow: 'auto',
      }}
    >
      {logs.length === 0
        ? '(no events received yet)'
        : logs.map((log, i) => <div key={i}>{log}</div>)}
    </pre>
  );
}

// ── App Root ───────────────────────────────────────────────

export function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>🐝 Swarm Relay Playground</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Two simulated microfrontends, each with its own{' '}
        <code>SwarmRelayProvider</code>. Broadcasts from one arrive in the
        other. Targeted messages go to a specific client.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
        }}
      >
        {/* Each panel gets its own provider with a unique clientId */}
        <div
          style={{
            border: '2px solid #42a5f5',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <SwarmRelayProvider<AppEvents>
            clientId="shell"
            autoConnect
            onError={(err) => console.error('[Shell]', err)}
          >
            <ShellPanel />
          </SwarmRelayProvider>
        </div>

        <div
          style={{
            border: '2px solid #66bb6a',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <SwarmRelayProvider<AppEvents>
            clientId="cart"
            autoConnect
            onError={(err) => console.error('[Cart]', err)}
          >
            <CartPanel />
          </SwarmRelayProvider>
        </div>
      </div>
    </div>
  );
}

export default App;
