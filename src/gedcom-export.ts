import type { Citation, GedcomData, GedEvent, Where } from './gedcom';

function citeLines(g: GedcomData, level: number, cites: Citation[] | undefined, where: Where): string[] {
  return (cites ?? [])
    .filter((c) => c.where === where)
    .flatMap((c) => {
      const inline = c.source.startsWith('inline:');
      const value = inline ? (g.sources.get(c.source)?.title ?? '').replace(/\r?\n/g, ' ') : c.source;
      return [`${level} SOUR ${value}`.trimEnd(), ...(c.page ? [`${level + 1} PAGE ${c.page}`] : [])];
    });
}

function eventLines(g: GedcomData, tag: string, e: GedEvent | undefined, cites?: Citation[], where?: Where): string[] {
  if (!e) return [];
  const out = [`1 ${tag}`];
  if (e.date) out.push(`2 DATE ${e.date}`);
  if (e.place) out.push(`2 PLAC ${e.place}`);
  if (where) out.push(...citeLines(g, 2, cites, where));
  return out;
}

// Writes GEDCOM 5.5.1 (UTF-8). Values with line breaks are split with CONT.
export function writeGedcom(g: GedcomData): string {
  const clean = (s: string) => s.replace(/\r?\n/g, ' ');
  const lines = ['0 HEAD', '1 SOUR Annes-Chart', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
  for (const p of g.people.values()) {
    lines.push(`0 ${p.id} INDI`, `1 NAME ${clean(p.given)} /${clean(p.surname)}/`);
    if (p.sex !== 'U') lines.push(`1 SEX ${p.sex}`);
    lines.push(...eventLines(g, 'BIRT', p.birth, p.citations, 'BIRT'), ...eventLines(g, 'DEAT', p.death, p.citations, 'DEAT'));
    for (const f of p.famc) {
      lines.push(`1 FAMC ${f}`);
      const ped = p.pedigree?.[f];
      if (ped && ped !== 'birth') lines.push(`2 PEDI ${ped}`);
    }
    for (const f of p.fams) lines.push(`1 FAMS ${f}`);
    lines.push(...citeLines(g, 1, p.citations, 'INDI'));
  }
  for (const f of g.families.values()) {
    lines.push(`0 ${f.id} FAM`);
    if (f.husband) lines.push(`1 HUSB ${f.husband}`);
    if (f.wife) lines.push(`1 WIFE ${f.wife}`);
    for (const c of f.children) lines.push(`1 CHIL ${c}`);
    lines.push(...eventLines(g, 'MARR', f.marriage, f.citations, 'MARR'));
    if (f.divorced) lines.push('1 DIV');
    lines.push(...citeLines(g, 1, f.citations, 'INDI'));
  }
  for (const s of g.sources.values()) {
    if (s.id.startsWith('inline:')) continue;
    lines.push(`0 ${s.id} SOUR`, `1 TITL ${clean(s.title)}`);
    if (s.author) lines.push(`1 AUTH ${clean(s.author)}`);
  }
  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}
