import { swarmRelay } from './swarm-relay.js';

describe('swarmRelay', () => {
  it('should work', () => {
    expect(swarmRelay()).toEqual('swarm-relay');
  });
});
