/**
 * Returns the SharedWorker hub script as a string for inline Blob creation.
 *
 * The worker acts as a central message-routing hub:
 * - Accepts port connections from microfrontends
 * - Registers clients by their unique `clientId`
 * - Routes targeted messages to a specific client
 * - Broadcasts messages to all connected clients (except the sender)
 * - Cleans up disconnected clients
 */
export function getWorkerScript(): string {
  return `
'use strict';

/** @type {Map<string, MessagePort>} */
const ports = new Map();

self.onconnect = function handleConnect(e) {
  const port = e.ports[0];
  let clientId = null;

  port.onmessage = function handleMessage(event) {
    const data = event.data;

    // --- Registration ---
    if (data.type === '__swarm_register__') {
      clientId = data.clientId;
      ports.set(clientId, port);
      port.postMessage({ type: '__swarm_registered__', clientId: clientId });
      return;
    }

    // --- Disconnection ---
    if (data.type === '__swarm_disconnect__') {
      if (clientId) {
        ports.delete(clientId);
        clientId = null;
      }
      return;
    }

    // --- Message routing ---
    if (data.type === '__swarm_message__') {
      const message = data.message;

      if (message.target) {
        // Targeted: deliver to a single client
        const targetPort = ports.get(message.target);
        if (targetPort) {
          targetPort.postMessage({ type: '__swarm_message__', message: message });
        }
      } else {
        // Broadcast: deliver to every client except the sender
        ports.forEach(function forwardBroadcast(p, id) {
          if (id !== message.source) {
            p.postMessage({ type: '__swarm_message__', message: message });
          }
        });
      }
    }
  };

  port.onmessageerror = function handleError() {
    if (clientId) {
      ports.delete(clientId);
      clientId = null;
    }
  };

  port.start();
};
`;
}
