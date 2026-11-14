import { describe, expect, it } from 'vitest';
import { layoutTree } from '../src/layout';
import { esc, fit, renderSvg, textWidth } from '../src/render';

describe('text fitting', () => {
  it('estimates wider text as wider', () => {
    expect(textWidth('WWWW', 13)).toBeGreaterThan(textWidth('iiii', 13));
    expect(textWidth('abc', 13, true)).toBeGreaterThan(textWidth('abc', 13));
    expect(textWidth('é', 13)).toBe(textWidth('e', 13));
  });
  it('shortens only what does not fit', () => {
    expect(fit('Bob', 148, 13, true)).toBe('Bob');
    const cut = fit('Alexandria Montgomery-Smythe-Featherstonehaugh', 148, 13, true);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 13, true)).toBeLessThanOrEqual(148);
    expect(fit('WWWWWWWWWWWWWWWWWWWWWWWW', 148, 13, true).length).toBeLessThan(fit('iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii', 148, 13, true).length);
  });
});

describe('svg output', () => {
  const svg = renderSvg(layoutTree({ id: 'a#2', ref: 'a', label: 'A very long name that cannot possibly fit in one box', sublabel: 'Title', note: '3 reports', children: [] }));

  it('tags a box with the person it stands for, not its internal key', () => {
    expect(svg).toContain('data-id="a"');
  });
  it('carries the full text as a tooltip', () => {
    expect(svg).toContain('<title>A very long name that cannot possibly fit in one box\nTitle\n3 reports</title>');
  });
  it('draws three lines when there is a note', () => {
    expect(svg.match(/<text /g)).toHaveLength(3);
  });
  it('drops characters XML does not allow', () => {
    expect(esc('a\u0001b\u000Bc<d')).toBe('abc&lt;d');
  });
});
