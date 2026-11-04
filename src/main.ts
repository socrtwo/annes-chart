import { parseGedcom, type GedcomData } from './gedcom';
import { genealogyChart, layoutTree, orgToTree, parseOrgCsv, type GenealogyKind } from './layout';
import { renderSvg } from './render';
import { Editor } from './editor';
import { parseDoc, serializeDoc, type Doc } from './document';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let ged: GedcomData | undefined;
let svg = '';

function show(markup: string, note: string) {
  stopEditor();
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
    if (/\.json$/i.test(file.name)) {
      ged = undefined;
      startEditor(parseDoc(await file.text()));
      return;
    }
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

let editor: Editor | undefined;
const toolIds = ['add', 'connect', 'delete', 'undo', 'redo', 'savedoc'];

function syncTools() {
  for (const id of toolIds) $<HTMLButtonElement>(id).disabled = !editor;
  if (!editor) return;
  $<HTMLButtonElement>('undo').disabled = !editor.bus.canUndo;
  $<HTMLButtonElement>('redo').disabled = !editor.bus.canRedo;
}

function stopEditor() {
  editor?.dispose();
  editor = undefined;
  syncTools();
}

function startEditor(doc?: Doc) {
  stopEditor();
  editor = new Editor($('stage'), doc, (markup) => {
    svg = markup;
    syncTools();
  });
  $('msg').textContent = 'Drag to move, shift-click to multi-select, double-click to edit text.';
  syncTools();
}

$('new').addEventListener('click', () => startEditor());
$('add').addEventListener('click', () => editor?.addShape());
$('connect').addEventListener('click', () => {
  if (editor && !editor.connectSelected()) $('msg').textContent = 'Select two unconnected shapes (shift-click) to connect them.';
});
$('delete').addEventListener('click', () => editor?.deleteSelected());
$('undo').addEventListener('click', () => editor?.undo());
$('redo').addEventListener('click', () => editor?.redo());
$('savedoc').addEventListener('click', () => {
  if (!editor) return;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([serializeDoc(editor.bus.state)], { type: 'application/json' })),
    download: 'chart.json',
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

document.addEventListener('keydown', (e) => {
  if (!editor || (e.target as HTMLElement).closest('input,select,textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') (e.preventDefault(), e.shiftKey ? editor.redo() : editor.undo());
  else if (mod && e.key.toLowerCase() === 'y') (e.preventDefault(), editor.redo());
  else if (e.key === 'Delete') editor.deleteSelected();
});
