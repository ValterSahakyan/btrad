import { isSignalExpired } from './signal.utils';

describe('isSignalExpired', () => {
  it('returns true for expired timestamps', () => {
    expect(isSignalExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isSignalExpired(new Date(Date.now() + 1000))).toBe(false);
  });
});
