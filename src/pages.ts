import type { Command } from './commands';
import { emptyDoc, serializeDoc, validateDoc, type Doc } from './document';

export interface Page {
  name: string;
  doc: Doc;
}

/** A multi-page drawing. Each page is an ordinary single-page Doc. */
export interface Book {
  version: 2;
  pages: Page[];
  /** Page that was open when the file was saved. */
  current: number;
}

export const emptyBook = (): Book => ({ version: 2, pages: [{ name: 'Page-1', doc: emptyDoc() }], current: 0 });

export const bookOf = (doc: Doc, name = 'Page-1'): Book => ({ version: 2, pages: [{ name, doc }], current: 0 });

/** Runs a single-page command against one page of a book; the page is chosen when the command runs. */
export function onPage<A>(cmd: Command<Doc, A>, index: () => number): Command<Book, A> {
  return {
    id: cmd.id,
    title: cmd.title,
    run: (book, arg) => {
      const i = index();
      const page = book.pages[i];
      if (!page) return undefined;
      const next = cmd.run(page.doc, arg);
      if (next === undefined || next === page.doc) return undefined;
      return { ...book, pages: book.pages.map((p, j) => (j === i ? { ...p, doc: next } : p)) };
    },
  };
}

const uniqueName = (pages: Page[], base: string) => {
  let n = pages.length + 1;
  let name = base || `Page-${n}`;
  while (pages.some((p) => p.name === name)) name = `${base || 'Page'}-${n++}`;
  return name;
};

export const addPage: Command<Book, { name?: string; doc?: Doc } | undefined> = {
  id: 'page.add',
  title: 'Add page',
  run: (b, a) => ({ ...b, pages: [...b.pages, { name: uniqueName(b.pages, a?.name ?? `Page-${b.pages.length + 1}`), doc: a?.doc ?? emptyDoc() }] }),
};

export const renamePage: Command<Book, { index: number; name: string }> = {
  id: 'page.rename',
  title: 'Rename page',
  run: (b, { index, name }) => {
    const n = name.trim();
    if (!b.pages[index] || !n || b.pages[index].name === n || b.pages.some((p, i) => i !== index && p.name === n)) return undefined;
    return { ...b, pages: b.pages.map((p, i) => (i === index ? { ...p, name: n } : p)) };
  },
};

/** The last remaining page cannot be deleted. */
export const deletePage: Command<Book, number> = {
  id: 'page.delete',
  title: 'Delete page',
  run: (b, index) => (b.pages.length <= 1 || !b.pages[index] ? undefined : { ...b, pages: b.pages.filter((_, i) => i !== index) }),
};

export const movePage: Command<Book, { from: number; to: number }> = {
  id: 'page.move',
  title: 'Reorder page',
  run: (b, { from, to }) => {
    if (from === to || !b.pages[from] || to < 0 || to >= b.pages.length) return undefined;
    const pages = [...b.pages];
    pages.splice(to, 0, pages.splice(from, 1)[0]);
    return { ...b, pages };
  },
};

export const pageCommands = [addPage, renamePage, deletePage, movePage] as Command<Book, any>[];

export const serializeBook = (b: Book, current = b.current): string =>
  JSON.stringify({ version: 2, current, pages: b.pages.map((p) => ({ name: p.name, doc: JSON.parse(serializeDoc(p.doc)) })) }, null, 2);

/** Reads a saved drawing: the current multi-page format, or an older single-page file. */
export function parseBook(text: string): Book {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid chart file (invalid JSON)');
  }
  if (raw?.version === 1) return bookOf(validateDoc(raw));
  if (raw?.version !== 2 || !Array.isArray(raw.pages) || !raw.pages.length) throw new Error('Unsupported chart file format');
  const names = new Set<string>();
  const pages = raw.pages.map((p: any, i: number) => {
    const name = typeof p?.name === 'string' && p.name.trim() ? p.name : `Page-${i + 1}`;
    if (names.has(name)) throw new Error(`Duplicate page name "${name}"`);
    names.add(name);
    return { name, doc: validateDoc(p?.doc) };
  });
  const current = Number.isInteger(raw.current) && raw.current >= 0 && raw.current < pages.length ? raw.current : 0;
  return { version: 2, pages, current };
}
