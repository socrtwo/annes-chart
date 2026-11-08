import { describe, expect, it } from 'vitest';
import { CommandBus } from '../src/commands';
import { documentCommands } from '../src/document';
import { addPage, bookOf, deletePage, emptyBook, movePage, onPage, pageCommands, parseBook, renamePage, serializeBook } from '../src/pages';
import { chartToDoc } from '../src/convert';
import { orgChart } from '../src/org';

function make() {
  let page = 0;
  const bus = new CommandBus(emptyBook());
  for (const c of documentCommands) bus.register(onPage(c, () => page));
  for (const c of pageCommands) bus.register(c);
  return { bus, setPage: (i: number) => (page = i) };
}

describe('pages', () => {
  it('keeps shapes on the page they were added to, with undo', () => {
    const { bus, setPage } = make();
    bus.execute('shape.add', { text: 'one' });
    bus.execute('page.add');
    setPage(1);
    bus.execute('shape.add', { text: 'two' });
    expect(bus.state.pages.map((p) => p.doc.shapes.map((s) => s.text))).toEqual([['one'], ['two']]);
    bus.undo();
    expect(bus.state.pages[1].doc.shapes).toHaveLength(0);
    bus.undo();
    expect(bus.state.pages).toHaveLength(1);
  });
  it('renames, reorders and deletes pages but keeps at least one', () => {
    let b = emptyBook();
    b = addPage.run(b, { name: 'Second' })!;
    b = addPage.run(b, { name: 'Second' })!; // duplicate names get a suffix
    expect(new Set(b.pages.map((p) => p.name)).size).toBe(3);
    expect(renamePage.run(b, { index: 0, name: 'Second' })).toBeUndefined();
    b = renamePage.run(b, { index: 0, name: 'Intro' })!;
    b = movePage.run(b, { from: 0, to: 2 })!;
    expect(b.pages[2].name).toBe('Intro');
    b = deletePage.run(b, 0)!;
    b = deletePage.run(b, 0)!;
    expect(deletePage.run(b, 0)).toBeUndefined();
    expect(b.pages).toHaveLength(1);
  });
  it('saves and loads books and old single-page files', () => {
    const { bus } = make();
    bus.execute('shape.add', { text: 'A', x: 5 });
    bus.execute('page.add', { name: 'Two' });
    const again = parseBook(serializeBook(bus.state, 1));
    expect(again.current).toBe(1);
    expect(again.pages.map((p) => p.name)).toEqual(['Page-1', 'Two']);
    expect(again.pages[0].doc.shapes[0].text).toBe('A');
    const old = parseBook(JSON.stringify({ version: 1, shapes: [{ id: 's1', x: 0, y: 0, w: 1, h: 1 }], connectors: [] }));
    expect(old.pages).toHaveLength(1);
    expect(bookOf(old.pages[0].doc).pages[0].name).toBe('Page-1');
  });
  it('rejects bad files', () => {
    expect(() => parseBook('x')).toThrow(/JSON/);
    expect(() => parseBook('{"version":2,"pages":[]}')).toThrow();
    expect(() => parseBook('{"version":2,"pages":[{"name":"a","doc":{"version":1,"shapes":[],"connectors":[]}},{"name":"a","doc":{"version":1,"shapes":[],"connectors":[]}}]}')).toThrow(/Duplicate/);
    expect(() => parseBook('{"version":2,"pages":[{"name":"a","doc":{}}]}')).toThrow();
  });
});

describe('chartToDoc', () => {
  it('makes shapes and connectors from a chart', () => {
    const c = orgChart([{ id: '1', name: 'Jane', title: 'CEO' }, { id: '2', name: 'Bob', manager: '1' }]);
    const d = chartToDoc(c);
    const id = (t: string) => d.shapes.find((s) => s.text === t)!.id;
    expect(d.shapes.map((s) => s.text).sort()).toEqual(['Bob', 'Jane - CEO']);
    expect(d.connectors).toEqual([{ id: 'c1', from: id('Jane - CEO'), to: id('Bob') }]);
  });
});
