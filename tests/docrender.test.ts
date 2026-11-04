import { describe, expect, it } from 'vitest';
import { renderDoc } from '../src/docrender';
import type { Doc } from '../src/document';

const doc: Doc = {
  version: 1,
  shapes: [
    { id: 's1', x: 10, y: 10, w: 100, h: 50, text: 'A <b>', kind: 'rounded' },
    { id: 's2', x: 900, y: 700, w: 100, h: 50, text: 'B', kind: 'rounded' },
  ],
  connectors: [{ id: 'c1', from: 's1', to: 's2' }],
};

describe('renderDoc', () => {
  it('draws shapes, connectors, escapes text and grows the canvas', () => {
    const svg = renderDoc(doc);
    expect(svg).toContain('data-id="s1"');
    expect(svg).toContain('data-connector="c1"');
    expect(svg).toContain('A &lt;b&gt;');
    expect(svg).toContain('width="1022"');
    expect(svg).toContain('height="772"');
  });

  it('highlights the selection', () => {
    expect(renderDoc(doc, new Set(['s1']))).toContain('stroke="#2563eb"');
    expect(renderDoc(doc)).not.toContain('#2563eb');
  });

  it('draws each stencil kind', () => {
    const shape = (kind: any) => ({ ...doc, shapes: [{ ...doc.shapes[0], kind }], connectors: [] });
    expect(renderDoc(shape('ellipse'))).toContain('<ellipse');
    expect(renderDoc(shape('diamond'))).toContain('<polygon');
    expect(renderDoc(shape('rectangle'))).toContain('rx="0"');
    expect(renderDoc(shape('rounded'))).toContain('rx="6"');
  });
});
