import { describe, expect, it } from 'vitest';
import { pngScale, svgSize } from '../src/raster';

describe('raster', () => {
  it('reads svg size', () => {
    expect(svgSize('<svg xmlns="x" width="120.5" height="80" viewBox="0 0 1 1"></svg>')).toEqual({ w: 120.5, h: 80 });
  });
  it('throws without size', () => {
    expect(() => svgSize('<svg></svg>')).toThrow();
  });
  it('keeps the requested scale for ordinary charts and reduces it for huge ones', () => {
    expect(pngScale(2000, 1000)).toBe(2);
    expect(pngScale(40000, 300) * 40000).toBeLessThanOrEqual(32767);
    const s = pngScale(20000, 20000);
    expect(s * 20000 * s * 20000).toBeLessThanOrEqual(268_435_456 + 1);
  });
});
