import { clampGenerations, createApp, draw, exportGedcom, openDocument, personOptions, type AppState, type ChartKind, type Drawing } from './app';
import type { GedcomExportMode } from './gedcom-export';
import type { OrgStyle } from './org';
import { svgToPng } from './raster';
import sampleGed from '../samples/family.ged?raw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const kind = $<HTMLSelectElement>('kind');
const person = $<HTMLSelectElement>('person');
const find = $<HTMLInputElement>('find');
const gens = $<HTMLInputElement>('gens');
const hideLiving = $<HTMLInputElement>('hideliving');
const orgStyle = $<HTMLSelectElement>('orgstyle');
const rollup = $<HTMLInputElement>('rollup');

const bus = createApp();
let svg = '';
let listedFor: unknown; // what the person list was last built from

const say = (text: string) => ($('msg').textContent = text);
const fail = (err: unknown) => say(String(err instanceof Error ? err.message : err));

function fillPeople(state: AppState) {
  const key = `${find.value}\u0000${state.hideLiving}\u0000${find.value ? state.person : ''}`; // a filtered list always keeps the current person
  if (listedFor === state.doc && person.dataset.key === key) return;
  listedFor = state.doc;
  person.dataset.key = key;
  const words = find.value.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = personOptions(state).filter((o) => o.id === state.person || words.every((w) => o.label.toLowerCase().includes(w)));
  person.replaceChildren(...shown.map((o) => Object.assign(document.createElement('option'), { value: o.id, textContent: o.label })));
}

function render(state: AppState) {
  document.body.dataset.mode = state.doc?.type ?? 'none';
  kind.value = state.kind;
  gens.value = String(state.generations);
  hideLiving.checked = state.hideLiving;
  orgStyle.value = state.orgStyle;
  rollup.checked = state.rollup;
  fillPeople(state);
  person.value = state.person;
  $<HTMLButtonElement>('undo').disabled = !bus.canUndo;
  $<HTMLButtonElement>('redo').disabled = !bus.canRedo;

  let out: Drawing;
  try {
    out = draw(state);
  } catch (err) {
    out = { svg: '', note: String(err instanceof Error ? err.message : err), warnings: [] };
  }
  svg = out.svg;
  $('stage').innerHTML = svg;
  say(out.note);
  const warn = $<HTMLDetailsElement>('warn');
  warn.hidden = !out.warnings.length;
  warn.querySelector('summary')!.textContent = `${out.warnings.length} warning${out.warnings.length === 1 ? '' : 's'}`;
  warn.querySelector('ul')!.replaceChildren(...out.warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
}

function download(data: Blob, name: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(data), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000); // some browsers start the download after click() returns
}

async function open(name: string, bytes: Uint8Array) {
  try {
    bus.execute('doc.open', await openDocument(name, bytes));
  } catch (err) {
    fail(err); // the chart on screen and its data stay as they were
  }
}

bus.subscribe(render);
render(bus.state);

$('sample').addEventListener('click', () => open('family.ged', new TextEncoder().encode(sampleGed)));

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await open(file.name, new Uint8Array(await file.arrayBuffer()));
  input.value = ''; // so that choosing the same file again is still a change
});

kind.addEventListener('change', () => bus.execute('view.set', { kind: kind.value as ChartKind }));
person.addEventListener('change', () => bus.execute('view.set', { person: person.value }));
gens.addEventListener('change', () => {
  bus.execute('view.set', { generations: clampGenerations(gens.value) });
  gens.value = String(bus.state.generations);
});
hideLiving.addEventListener('change', () => bus.execute('view.set', { hideLiving: hideLiving.checked }));
orgStyle.addEventListener('change', () => bus.execute('view.set', { orgStyle: orgStyle.value as OrgStyle }));
rollup.addEventListener('change', () => bus.execute('view.set', { rollup: rollup.checked }));
find.addEventListener('input', () => {
  fillPeople(bus.state);
  person.value = bus.state.person;
});

$('undo').addEventListener('click', () => bus.undo());
$('redo').addEventListener('click', () => bus.redo());
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.target instanceof HTMLInputElement && /^(text|search|number)$/.test(e.target.type)) return; // leave typing undo alone
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) bus.undo();
  else if (key === 'y' || (key === 'z' && e.shiftKey)) bus.redo();
  else return;
  e.preventDefault();
});

$('save').addEventListener('click', () => {
  if (svg) download(new Blob([svg], { type: 'image/svg+xml' }), 'chart.svg');
});

$('savepng').addEventListener('click', async () => {
  if (!svg) return;
  try {
    download(await svgToPng(svg), 'chart.png');
  } catch (err) {
    fail(err);
  }
});

$('print').addEventListener('click', () => {
  if (svg) window.print();
});

$('saveged').addEventListener('click', () => {
  const mode = $<HTMLSelectElement>('gedmode').value as GedcomExportMode;
  const out = exportGedcom(bus.state, mode);
  if (!out) return;
  download(new Blob([out.text], { type: 'text/plain' }), out.name);
  say(out.note);
});
