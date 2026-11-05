import { describe, expect, it } from 'vitest';
import { svgSize } from '../src/raster';

describe('raster', () => {
  it('reads svg size', () => {
    expect(svgSize('<svg xmlns="x" width="120.5" height="80" viewBox="0 0 1 1"></svg>')).toEqual({ w: 120.5, h: 80 });
  });
  it('throws without size', () => {
    expect(() => svgSize('<svg></svg>')).toThrow();
  });
});
