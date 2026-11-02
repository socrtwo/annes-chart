import { parseGedcom, type GedcomData } from './gedcom';
import { genealogyChart, layoutTree, orgToTree, parseOrgCsv, type GenealogyKind } from './layout';
import { renderSvg } from './render';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let ged: GedcomData | undefined;
let svg = '';

function show(markup: string, note: string) {
  svg = markup;
  $('stage').innerHTML = markup;
  $('msg').textContent = note;
}

function drawGenealogy() {
  if (!ged || !$<HTMLSelectElement>('person').value) return;
  const chart = genealogyChart(ged, $<HTMLSelectElement>('kind').value as GenealogyKind, $<HTMLSelectElement>('person').value, Number($<HTMLInputElement>('gens').value) || 5);
  show(renderSvg(chart), `${ged.people.size} people, ${ged.families.size} families${ged.warnings.length ? `, ${ged.warnings.length} warnings` : ''}`);
}

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (/\.csv$/i.test(file.name)) {
      ged = undefined;
      const rows = parseOrgCsv(await file.text());
      show(renderSvg(layoutTree(orgToTree(rows))), `${rows.length} people in the org chart`);
      return;
    }
    ged = parseGedcom(new Uint8Array(await file.arrayBuffer()));
    const sel = $<HTMLSelectElement>('person');
    sel.replaceChildren(
      ...[...ged.people.values()].map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })),
    );
    drawGenealogy();
  } catch (err) {
    $('msg').textContent = String(err instanceof Error ? err.message : err);
  }
});

for (const id of ['kind', 'person', 'gens']) $(id).addEventListener('change', drawGenealogy);

$('save').addEventListener('click', () => {
  if (!svg) return;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), download: 'chart.svg' });
  a.click();
  URL.revokeObjectURL(a.href);
});
