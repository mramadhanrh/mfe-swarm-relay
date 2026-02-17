export type AppEvents = {
  'user:login': { userId: string; displayName: string };
  'user:logout': { reason: string };
  'cart:update': { items: string[]; total: number };
  'notification:show': { message: string; severity: 'info' | 'error' };
};
