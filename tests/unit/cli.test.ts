import { describe, expect, it } from 'vitest';
import { resolvePortOverride } from '../../src/portUtils.ts';

describe('resolvePortOverride', () => {
  it('returns portOverride when explicitly specified', () => {
    expect(resolvePortOverride(8080, '9000')).toBe(8080);
  });

  it('returns NYMPH_PORT env value when no override', () => {
    expect(resolvePortOverride(null, '7000')).toBe(7000);
  });

  it('returns null when neither override nor env is set', () => {
    expect(resolvePortOverride(null, undefined)).toBeNull();
  });

  it('returns null for empty NYMPH_PORT string', () => {
    expect(resolvePortOverride(null, '')).toBeNull();
  });

  it('returns null for invalid NYMPH_PORT string', () => {
    expect(resolvePortOverride(null, 'abc')).toBeNull();
  });
});
