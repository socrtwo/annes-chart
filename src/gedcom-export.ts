import type { GedcomData, GedEvent } from './gedcom';

function eventLines(tag: string, e?: GedEvent): string[] {
  if (!e) return [];
  const out = [`1 ${tag}`];
  if (e.date) out.push(`2 DATE ${e.date}`);
  if (e.place) out.push(`2 PLAC ${e.place}`);
  return out;
}

// Writes GEDCOM 5.5.1 (UTF-8). Values with line breaks are split with CONT.
export function writeGedcom(g: GedcomData): string {
  const clean = (s: string) => s.replace(/\r?\n/g, ' ');
  const lines = ['0 HEAD', '1 SOUR Annes-Chart', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
  for (const p of g.people.values()) {
    lines.push(`0 ${p.id} INDI`, `1 NAME ${clean(p.given)} /${clean(p.surname)}/`);
    if (p.sex !== 'U') lines.push(`1 SEX ${p.sex}`);
    lines.push(...eventLines('BIRT', p.birth), ...eventLines('DEAT', p.death));
    for (const f of p.famc) lines.push(`1 FAMC ${f}`);
    for (const f of p.fams) lines.push(`1 FAMS ${f}`);
  }
  for (const f of g.families.values()) {
    lines.push(`0 ${f.id} FAM`);
    if (f.husband) lines.push(`1 HUSB ${f.husband}`);
    if (f.wife) lines.push(`1 WIFE ${f.wife}`);
    for (const c of f.children) lines.push(`1 CHIL ${c}`);
    lines.push(...eventLines('MARR', f.marriage));
    if (f.divorced) lines.push('1 DIV');
  }
  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}
