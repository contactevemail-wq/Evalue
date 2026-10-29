// 학습지 렌더러: JSON 학습지를 종이 학습지처럼 그린다. (스키마는 CLAUDE.md 참고)

import { h, rich } from './dom.js';
import { Pad } from './pad.js';
import { speak, speakAll, canSpeak } from './speech.js';
import { getMark, setMark, loadInk, saveInk } from './store.js';

const GUIDE_FONT = '"Klee One", "Hiragino Mincho ProN", "Yu Mincho", serif';
const fontReady = document.fonts?.load(`40px ${GUIDE_FONT}`, 'あ').catch(() => {}) ?? Promise.resolve();

const MARKS = [
  { value: 'o', label: '○', title: '맞음' },
  { value: 't', label: '△', title: '애매함' },
  { value: 'x', label: '✕', title: '틀림' },
];

// --- 캔버스 배경 ---

function gridBackground(cols, rows, guides = []) {
  return (ctx, w, h) => {
    const cell = w / cols;
    ctx.strokeStyle = '#e7b7a3';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
    for (let c = 1; c < cols; c++) line(ctx, c * cell, 0, c * cell, h);
    for (let r = 1; r < rows; r++) line(ctx, 0, r * cell, w, r * cell);

    // 칸마다 십자 보조선
    ctx.strokeStyle = '#f3d9ce';
    ctx.setLineDash([4, 4]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        line(ctx, c * cell + cell / 2, r * cell, c * cell + cell / 2, (r + 1) * cell);
        line(ctx, c * cell, r * cell + cell / 2, (c + 1) * cell, r * cell + cell / 2);
      }
    }
    ctx.setLineDash([]);

    // 따라 쓰기용 흐린 글자
    ctx.fillStyle = 'rgba(29, 36, 51, 0.17)';
    ctx.font = `${cell * 0.74}px ${GUIDE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    guides.forEach((ch, i) => {
      if (!ch) return;
      const c = i % cols;
      const r = Math.floor(i / cols);
      ctx.fillText(ch, c * cell + cell / 2, r * cell + cell * 0.54);
    });
  };
}

function linesBackground(count) {
  return (ctx, w, h) => {
    const lh = h / count;
    for (let i = 0; i < count; i++) {
      const base = i * lh + lh * 0.78;
      ctx.strokeStyle = '#e4eaf2';
      ctx.setLineDash([5, 5]);
      line(ctx, 0, base - lh * 0.3, w, base - lh * 0.3);
      ctx.setLineDash([]);
      ctx.strokeStyle = '#b8c5d6';
      ctx.lineWidth = 1.2;
      line(ctx, 0, base, w, base);
    }
  };
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// --- 공통 부품 ---

function speakButton(text, lang, label = '발음 듣기') {
  if (!canSpeak || !text) return null;
  return h('button', { class: 'speak', type: 'button', title: label, 'aria-label': label, onclick: () => speak(text, lang) }, '🔊');
}

function langText(text, lang, cls = '') {
  return h('span', { class: `${cls} lang-${lang}`, lang }, text);
}

function markButtons(sheetId, itemId, onMark) {
  const wrap = h('div', { class: 'marks', role: 'group', 'aria-label': '스스로 채점' });
  const sync = () => {
    const current = getMark(sheetId, itemId);
    for (const btn of wrap.children) btn.classList.toggle('on', btn.dataset.value === current);
  };
  for (const m of MARKS) {
    wrap.append(h('button', {
      type: 'button',
      class: `mark mark-${m.value}`,
      'data-value': m.value,
      title: m.title,
      'aria-label': m.title,
      onclick: () => {
        const next = getMark(sheetId, itemId) === m.value ? null : m.value;
        setMark(sheetId, itemId, next);
        sync();
        onMark?.(itemId, next);
      },
    }, m.label));
  }
  sync();
  return wrap;
}

function padCanvas(inkKey, background, { aspect, short = false, maxWidth, redrawAfterFont = false }) {
  const canvas = h('canvas', { class: `pad${short ? ' short' : ''}`, style: { aspectRatio: aspect, maxWidth } });
  let timer;
  const pad = new Pad(canvas, {
    background,
    onChange: (strokes) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveInk(inkKey, strokes), 400);
    },
  });
  loadInk(inkKey).then((saved) => {
    if (saved.length) pad.setStrokes([...saved, ...pad.strokes]);
  });
  if (redrawAfterFont) fontReady.then(() => pad.redraw());
  return { canvas, pad };
}

function clearButton(pad) {
  return h('button', { type: 'button', class: 'chip', onclick: () => pad.clear() }, '지우기');
}

// --- 블록 렌더러 ---

function renderNote(item, lang) {
  const cards = item.style === 'cards';
  return h('div', { class: 'note' },
    item.title && h('h4', {}, item.title),
    (item.text ?? '').split('\n').filter(Boolean).map((p) => h('p', {}, rich(p))),
    item.examples?.length && h('ul', { class: cards ? 'cards' : 'examples' },
      item.examples.map((ex) => h('li', {},
        langText(ex.text, lang, cards ? 'card-text' : 'ex-text'),
        ex.ko && h('span', { class: 'ko' }, ex.ko),
        speakButton(ex.speak ?? ex.text, lang),
      )),
    ),
  );
}

function renderDialogue(item, lang) {
  const box = h('div', { class: 'dialogue' });
  const toggle = h('button', {
    type: 'button',
    class: 'chip',
    onclick: () => {
      box.classList.toggle('show-ko');
      toggle.textContent = box.classList.contains('show-ko') ? '해석 숨기기' : '해석 보기';
    },
  }, '해석 보기');
  box.append(
    h('div', { class: 'dialogue-head' },
      item.title && h('h4', {}, item.title),
      h('div', { class: 'row' },
        canSpeak && h('button', { type: 'button', class: 'chip', onclick: () => speakAll(item.lines, lang) }, '▶ 전체 듣기'),
        toggle,
      ),
    ),
    ...item.lines.map((l) => h('div', { class: 'line' },
      h('span', { class: 'speaker' }, l.speaker),
      h('div', { class: 'said' },
        langText(l.text, lang, 'said-text'),
        l.ko && h('span', { class: 'ko' }, l.ko),
      ),
      speakButton(l.text, lang),
    )),
  );
  return box;
}

function renderKana(item, ctx) {
  const trace = item.trace ?? 3;
  const cols = trace + (item.blank ?? 4);
  const guides = Array.from({ length: cols }, (_, i) => (i < trace ? item.char : null));
  const { canvas, pad } = padCanvas(ctx.inkKey, gridBackground(cols, 1, guides), {
    aspect: `${cols} / 1`,
    maxWidth: `${cols * 110}px`,
    redrawAfterFont: true,
  });
  return h('div', { class: 'item kana' },
    h('div', { class: 'kana-label' },
      langText(item.char, 'ja', 'kana-char'),
      h('span', { class: 'romaji' }, item.romaji),
      item.ko && h('span', { class: 'ko' }, item.ko),
      speakButton(item.speak ?? item.char, 'ja'),
    ),
    h('div', { class: 'kana-body' },
      canvas,
      h('div', { class: 'item-actions' },
        clearButton(pad),
        markButtons(ctx.sheetId, ctx.itemId, ctx.onMark),
      ),
    ),
  );
}

// 한글이 섞인 부분은 한국어로, 나머지는 학습 언어로 표시한다. "___"는 빈칸.
function renderPrompt(text, lang) {
  return text.split(/(_{2,})/).map((part, i) => {
    if (i % 2) return h('span', { class: 'blank' });
    return langText(part, /[가-힣]/.test(part) ? 'ko' : lang);
  });
}

function renderWrite(item, ctx) {
  const lang = item.lang ?? ctx.lang;
  const answerLang = item.answerLang ?? lang;
  const layout = item.layout ?? (answerLang === 'ja' ? 'grid' : 'lines');

  let surface;
  if (layout === 'grid') {
    const cells = item.cells ?? [...item.answer].length;
    const cols = Math.min(cells, item.cols ?? 10);
    const rows = Math.ceil(cells / cols);
    surface = padCanvas(ctx.inkKey, gridBackground(cols, rows), {
      aspect: `${cols} / ${rows}`,
      maxWidth: `${cols * 110}px`,
    });
  } else {
    const lines = item.lines ?? 1;
    const ratio = item.short ? 0.24 : 0.12;
    surface = padCanvas(ctx.inkKey, linesBackground(lines), {
      aspect: `1 / ${(lines * ratio).toFixed(3)}`,
      short: item.short,
    });
  }

  const answer = h('div', { class: 'answer', hidden: true },
    h('div', { class: 'answer-main' },
      h('span', { class: 'answer-label' }, item.example ? '예시 답안' : '정답'),
      langText(item.answer, answerLang, 'answer-text'),
      speakButton(item.answer, answerLang),
    ),
    item.alts?.length && h('div', { class: 'alts' }, '이렇게 써도 돼요: ', item.alts.map((a, i) => [i ? ' / ' : '', langText(a, answerLang)])),
    item.explain && h('p', { class: 'explain' }, rich(item.explain)),
  );
  const reveal = h('button', {
    type: 'button',
    class: 'chip primary',
    onclick: () => {
      answer.hidden = !answer.hidden;
      reveal.textContent = answer.hidden ? '정답 보기' : '정답 숨기기';
    },
  }, '정답 보기');

  return h('div', { class: 'item write' },
    h('div', { class: 'prompt' },
      h('span', { class: 'num' }, `${ctx.number}.`),
      h('div', { class: 'prompt-body' },
        h('div', { class: 'prompt-text' }, renderPrompt(item.prompt, lang), speakButton(item.speak, answerLang, '문제 듣기')),
        item.hint && h('div', { class: 'hint' }, rich(item.hint)),
      ),
    ),
    surface.canvas,
    h('div', { class: 'item-actions' },
      clearButton(surface.pad),
      reveal,
      markButtons(ctx.sheetId, ctx.itemId, ctx.onMark),
    ),
    answer,
  );
}

// --- 학습지 전체 ---

// options.only: 이 id 집합에 든 문항만 그린다(오답노트). options.inkPrefix: 손글씨 저장 키 앞부분.
export function renderSheet(sheet, { only = null, inkPrefix = '', onMark } = {}) {
  const root = h('div', { class: 'sections' });
  sheet.sections.forEach((section, si) => {
    const body = h('div', { class: 'section-body' });
    let number = 0;
    section.items.forEach((item, ii) => {
      const itemId = `${si}-${ii}`;
      const gradable = item.type === 'kana' || item.type === 'write';
      if (gradable) number++;
      if (only && !only.has(itemId)) return;
      const ctx = { sheetId: sheet.id, itemId, lang: sheet.lang, number, onMark, inkKey: `${inkPrefix}${sheet.id}/${itemId}` };
      if (item.type === 'note') body.append(renderNote(item, sheet.lang));
      else if (item.type === 'dialogue') body.append(renderDialogue(item, sheet.lang));
      else if (item.type === 'kana') body.append(renderKana(item, ctx));
      else if (item.type === 'write') body.append(renderWrite(item, ctx));
    });
    if (!body.children.length) return;
    root.append(h('section', { class: 'section' },
      h('h3', {}, section.title),
      section.desc && h('p', { class: 'section-desc' }, rich(section.desc)),
      body,
    ));
  });
  return root;
}
