// 손글씨 패드: 펜 획을 벡터로 저장하고, 크기가 바뀌면 배경과 함께 다시 그린다.
// 좌표는 캔버스 너비 기준(0~1)으로 저장해서 화면을 돌려도 글씨가 유지된다.

import { getSettings } from './store.js';

export const INK = { black: '#1d2433', red: '#d6336c', blue: '#1c64d6' };

// 모든 패드가 공유하는 도구 상태
export const tool = { mode: 'pen', color: INK.black };

const ERASER_RADIUS = 14;
const SCROLL_THRESHOLD = 8;

let undoStack = [];
let penSeen = false;
let lastPenTime = 0;

const pads = new WeakMap();
const resizer = new ResizeObserver((entries) => {
  for (const entry of entries) pads.get(entry.target)?.resize();
});

export function undo() {
  const entry = undoStack.pop();
  if (entry) entry.pad.revert(entry.op);
}

export function resetUndo() {
  undoStack = [];
}

function pushUndo(pad, op) {
  undoStack.push({ pad, op });
  if (undoStack.length > 200) undoStack.shift();
}

function mid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export class Pad {
  constructor(canvas, { background, strokes = [], onChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.background = background;
    this.strokes = strokes;
    this.onChange = onChange;
    this.current = null;
    this.scroller = null;
    this.size = { w: 0, h: 0 };

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    pads.set(canvas, this);
    resizer.observe(canvas);
  }

  setStrokes(strokes) {
    this.strokes = strokes;
    this.redraw();
  }

  // 손바닥 무시: 펜을 한 번이라도 쓰면(auto) 그 뒤로 손가락 터치는 필기가 아니라 스크롤로 처리한다.
  accepts(e) {
    if (e.pointerType === 'pen') {
      penSeen = true;
      return true;
    }
    if (e.pointerType !== 'touch') return true;
    const mode = getSettings().input;
    if (mode === 'all') return true;
    if (mode === 'pen') return false;
    return !penSeen;
  }

  point(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * 1e4) / 1e4,
      Math.round(((e.clientY - rect.top) / rect.width) * 1e4) / 1e4,
      Math.round(pressure * 100) / 100,
    ];
  }

  down(e) {
    if (this.current) return;
    if (!this.accepts(e)) {
      this.scroller = { id: e.pointerId, y: e.clientY, moved: false };
      return;
    }
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'pen') lastPenTime = Date.now();

    // 지우개 모드이거나, 펜 뒤쪽 지우개(buttons 32)를 쓴 경우
    if (tool.mode === 'eraser' || (e.buttons & 32)) {
      this.current = { id: e.pointerId, removed: [] };
      this.eraseAt(e);
      return;
    }
    const stroke = { c: tool.color, w: getSettings().width, p: [this.point(e)] };
    this.strokes.push(stroke);
    this.current = { id: e.pointerId, stroke };
  }

  move(e) {
    if (this.scroller?.id === e.pointerId) {
      this.scrollBy(e);
      return;
    }
    if (this.current?.id !== e.pointerId) return;
    e.preventDefault();
    if (e.pointerType === 'pen') lastPenTime = Date.now();
    const events = e.getCoalescedEvents?.() ?? [e];
    const list = events.length ? events : [e];

    if (this.current.removed) {
      for (const ev of list) this.eraseAt(ev);
      return;
    }
    const { stroke } = this.current;
    for (const ev of list) {
      stroke.p.push(this.point(ev));
      this.drawSegment(stroke, stroke.p.length - 1);
    }
  }

  up(e) {
    if (this.scroller?.id === e.pointerId) {
      this.scroller = null;
      return;
    }
    if (this.current?.id !== e.pointerId) return;
    const { stroke, removed } = this.current;
    this.current = null;

    if (removed) {
      if (removed.length) {
        pushUndo(this, { type: 'erase', removed });
        this.onChange?.(this.strokes);
      }
      return;
    }
    if (stroke.p.length === 1) this.drawDot(stroke);
    else this.drawEnd(stroke);
    pushUndo(this, { type: 'add', stroke });
    this.onChange?.(this.strokes);
  }

  // 펜을 쓰는 동안 손바닥이 닿아 화면이 흔들리지 않도록, 펜 사용 직후에는 스크롤하지 않는다.
  scrollBy(e) {
    const s = this.scroller;
    const dy = s.y - e.clientY;
    if (!s.moved && Math.abs(dy) < SCROLL_THRESHOLD) return;
    if (Date.now() - lastPenTime < 600) return;
    s.moved = true;
    s.y = e.clientY;
    window.scrollBy(0, dy);
  }

  eraseAt(e) {
    const [x, y] = this.point(e);
    const r = ERASER_RADIUS / this.size.w;
    let changed = false;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      if (s.p.some((p) => Math.hypot(p[0] - x, p[1] - y) < r)) {
        this.strokes.splice(i, 1);
        this.current.removed.push({ stroke: s, index: i });
        changed = true;
      }
    }
    if (changed) this.redraw();
  }

  clear() {
    if (!this.strokes.length) return;
    pushUndo(this, { type: 'clear', strokes: this.strokes });
    this.strokes = [];
    this.redraw();
    this.onChange?.(this.strokes);
  }

  revert(op) {
    if (op.type === 'add') {
      const i = this.strokes.indexOf(op.stroke);
      if (i >= 0) this.strokes.splice(i, 1);
    } else if (op.type === 'erase') {
      for (const { stroke, index } of [...op.removed].reverse()) this.strokes.splice(index, 0, stroke);
    } else if (op.type === 'clear') {
      this.strokes = op.strokes;
    }
    this.redraw();
    this.onChange?.(this.strokes);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.size = { w: rect.width, h: rect.height, dpr };
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.redraw();
  }

  redraw() {
    const { w, h, dpr } = this.size;
    if (!w) return;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    this.background?.(ctx, w, h);
    ctx.restore();
    for (const s of this.strokes) {
      if (s.p.length === 1) {
        this.drawDot(s);
        continue;
      }
      for (let i = 1; i < s.p.length; i++) this.drawSegment(s, i);
      this.drawEnd(s);
    }
  }

  lineWidth(stroke, p) {
    return stroke.w * (0.35 + p[2] * 1.3);
  }

  px(p) {
    return [p[0] * this.size.w, p[1] * this.size.w];
  }

  // 중점을 잇는 2차 곡선으로 그려서 획을 부드럽게 만든다.
  drawSegment(stroke, i) {
    const pts = stroke.p;
    if (i < 1) return;
    const start = i === 1 ? pts[0] : mid(pts[i - 2], pts[i - 1]);
    const end = mid(pts[i - 1], pts[i]);
    const ctx = this.ctx;
    ctx.strokeStyle = stroke.c;
    ctx.lineWidth = this.lineWidth(stroke, pts[i - 1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...this.px(start));
    ctx.quadraticCurveTo(...this.px(pts[i - 1]), ...this.px(end));
    ctx.stroke();
  }

  drawEnd(stroke) {
    const pts = stroke.p;
    const n = pts.length;
    const ctx = this.ctx;
    ctx.strokeStyle = stroke.c;
    ctx.lineWidth = this.lineWidth(stroke, pts[n - 1]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...this.px(mid(pts[n - 2], pts[n - 1])));
    ctx.lineTo(...this.px(pts[n - 1]));
    ctx.stroke();
  }

  drawDot(stroke) {
    const ctx = this.ctx;
    ctx.fillStyle = stroke.c;
    ctx.beginPath();
    ctx.arc(...this.px(stroke.p[0]), this.lineWidth(stroke, stroke.p[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
