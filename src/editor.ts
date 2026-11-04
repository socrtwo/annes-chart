import { CommandBus } from './commands';
import { documentCommands, emptyDoc, type Doc } from './document';
import { renderDoc } from './docrender';

/** Interactive canvas: selection, drag to move, connect, edit text, undo/redo. */
export class Editor {
  readonly bus: CommandBus<Doc>;
  private selected = new Set<string>();
  private drag?: { id: string; startX: number; startY: number; el: SVGGElement };

  constructor(
    private stage: HTMLElement,
    doc: Doc = emptyDoc(),
    private onChange: (svg: string) => void = () => {},
  ) {
    this.bus = new CommandBus(doc);
    for (const c of documentCommands) this.bus.register(c);
    this.bus.subscribe(() => this.render());
    stage.addEventListener('pointerdown', this.down);
    stage.addEventListener('pointermove', this.move);
    stage.addEventListener('pointerup', this.up);
    stage.addEventListener('dblclick', this.edit);
    this.render();
  }

  dispose(): void {
    this.stage.removeEventListener('pointerdown', this.down);
    this.stage.removeEventListener('pointermove', this.move);
    this.stage.removeEventListener('pointerup', this.up);
    this.stage.removeEventListener('dblclick', this.edit);
  }

  get svg(): string {
    return renderDoc(this.bus.state);
  }

  addShape(): void {
    const n = this.bus.state.shapes.length;
    this.bus.execute('shape.add', { x: 40 + (n % 6) * 150, y: 40 + Math.floor(n / 6) * 90, text: `Shape ${n + 1}` });
  }

  connectSelected(): boolean {
    const [from, to] = [...this.selected];
    return from !== undefined && to !== undefined && this.bus.execute('connector.add', { from, to });
  }

  deleteSelected(): void {
    if (this.selected.size) this.bus.execute('shape.delete', [...this.selected]);
    this.selected.clear();
    this.render();
  }

  undo(): void {
    this.bus.undo();
  }

  redo(): void {
    this.bus.redo();
  }

  render(): void {
    const ids = new Set(this.bus.state.shapes.map((s) => s.id));
    for (const id of this.selected) if (!ids.has(id)) this.selected.delete(id);
    this.stage.innerHTML = renderDoc(this.bus.state, this.selected);
    this.onChange(this.svg);
  }

  private shapeEl(e: Event): SVGGElement | null {
    return (e.target as Element).closest?.('g[data-id]') as SVGGElement | null;
  }

  private down = (e: PointerEvent) => {
    const el = this.shapeEl(e);
    if (!el) {
      this.selected.clear();
      this.render();
      return;
    }
    const id = el.dataset.id!;
    if (e.shiftKey) {
      if (!this.selected.delete(id)) this.selected.add(id);
    } else if (!this.selected.has(id)) {
      this.selected = new Set([id]);
    }
    this.render();
    const fresh = this.stage.querySelector<SVGGElement>(`g[data-id="${CSS.escape(id)}"]`)!;
    this.drag = { id, startX: e.clientX, startY: e.clientY, el: fresh };
    this.stage.setPointerCapture?.(e.pointerId);
  };

  private move = (e: PointerEvent) => {
    if (!this.drag) return;
    this.drag.el.setAttribute('transform', `translate(${e.clientX - this.drag.startX} ${e.clientY - this.drag.startY})`);
  };

  // One move command per drag, so a drag is a single undo step.
  private up = (e: PointerEvent) => {
    if (!this.drag) return;
    const { id, startX, startY } = this.drag;
    this.drag = undefined;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const moved = this.bus.execute('shape.move', { id, dx, dy });
    if (!moved) this.render();
  };

  private edit = (e: MouseEvent) => {
    const el = this.shapeEl(e);
    if (!el) return;
    const id = el.dataset.id!;
    const shape = this.bus.state.shapes.find((s) => s.id === id);
    const text = shape && window.prompt('Shape text', shape.text);
    if (text !== null && text !== undefined) this.bus.execute('shape.text', { id, text });
  };
}
