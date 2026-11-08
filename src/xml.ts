export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

export const unxml = (s: string) =>
  s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e],
  );

export const escXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Small non-validating XML reader: elements, attributes and text. Local names only (prefixes dropped). */
export function parseXml(text: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    const top = stack[stack.length - 1];
    top.text += unxml(text.slice(last, m.index));
    last = tag.lastIndex;
    if (m[1] !== undefined && m[0].startsWith('<![CDATA[')) {
      top.text += m[1];
    } else if (m[3]) {
      const name = m[3].replace(/^.*:/, '');
      if (m[2]) {
        if (stack.length > 1) stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^.*:/, '')] = unxml(a[2] ?? a[3]);
        const node: XNode = { name, attrs, children: [], text: '' };
        top.children.push(node);
        if (!m[5]) stack.push(node);
      }
    }
  }
  return root.children[0] ?? root;
}

export const kids = (n: XNode, name: string) => n.children.filter((c) => c.name === name);
export const kid = (n: XNode, name: string) => n.children.find((c) => c.name === name);
