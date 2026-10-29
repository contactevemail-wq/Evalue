// 화면 전환(해시 라우팅): #/ 목록, #/ws/<id> 학습지, #/review 오답노트, #/settings 설정

import { h } from './dom.js';
import { loadIndex, loadSheet, gradableItems } from './content.js';
import { renderSheet } from './worksheet.js';
import { tool, undo, resetUndo, INK } from './pad.js';
import {
  getSettings, setSetting, getUi, setUi, marksFor, allMarks,
  clearMarks, clearAllMarks, clearInk,
} from './store.js';

const app = document.getElementById('app');

function score(sheet) {
  const items = gradableItems(sheet);
  const marks = marksFor(sheet.id);
  const count = { o: 0, t: 0, x: 0 };
  for (const { id } of items) if (marks[id]) count[marks[id]]++;
  return { total: items.length, done: count.o + count.t + count.x, ...count };
}

function scoreLine(s) {
  return `○ ${s.o} · △ ${s.t} · ✕ ${s.x}`;
}

function topbar(...children) {
  return h('header', { class: 'topbar' }, ...children);
}

function backLink() {
  return h('a', { class: 'back', href: '#/' }, '← 목록');
}

function errorView(err) {
  return h('div', { class: 'empty' }, h('p', {}, err.message), h('a', { class: 'chip', href: '#/' }, '목록으로'));
}

// --- 목록 ---

async function homePage() {
  const index = await loadIndex();
  const current = getUi('lang', index.languages[0].code);
  const lang = index.languages.find((l) => l.code === current) ?? index.languages[0];
  const sheets = await Promise.all(lang.sheets.map((id) => loadSheet(id).catch(() => null)));

  const wrongCount = Object.values(allMarks())
    .reduce((n, m) => n + Object.values(m).filter((v) => v === 'x' || v === 't').length, 0);

  return [
    h('header', { class: 'hero' },
      h('h1', {}, 'Evalue'),
      h('p', {}, '펜으로 직접 쓰면서 공부하는 외국어 학습지'),
    ),
    h('nav', { class: 'tabs', role: 'tablist' },
      index.languages.map((l) => h('button', {
        type: 'button',
        role: 'tab',
        class: `tab${l.code === lang.code ? ' on' : ''}`,
        'aria-selected': String(l.code === lang.code),
        onclick: () => { setUi('lang', l.code); route(); },
      }, l.name)),
    ),
    h('div', { class: 'cards-grid' },
      sheets.filter(Boolean).map((sheet) => {
        const s = score(sheet);
        return h('a', { class: 'sheet-card', href: `#/ws/${sheet.id}` },
          h('span', { class: 'level' }, sheet.level),
          h('strong', {}, sheet.title),
          sheet.subtitle && h('span', { class: `subtitle lang-${sheet.lang}`, lang: sheet.lang }, sheet.subtitle),
          h('div', { class: 'progress' }, h('span', { style: { width: `${s.total ? (s.done / s.total) * 100 : 0}%` } })),
          h('span', { class: 'score' }, s.done ? `${s.done}/${s.total} · ${scoreLine(s)}` : `문항 ${s.total}개`),
        );
      }),
    ),
    h('div', { class: 'home-links' },
      h('a', { class: 'chip big', href: '#/review' }, `📒 오답노트${wrongCount ? ` (${wrongCount})` : ''}`),
      h('a', { class: 'chip big', href: '#/settings' }, '⚙️ 설정'),
    ),
  ];
}

// --- 학습지 ---

function toolbar() {
  const tools = [
    { id: 'black', label: '✏️', title: '검정 펜', mode: 'pen', color: INK.black },
    { id: 'red', label: '🖍️', title: '빨간 펜(채점용)', mode: 'pen', color: INK.red },
    { id: 'eraser', label: '🧽', title: '지우개(획 단위)', mode: 'eraser' },
  ];
  const bar = h('div', { class: 'tools' });
  const sync = () => {
    for (const btn of bar.querySelectorAll('[data-tool]')) {
      const t = tools.find((x) => x.id === btn.dataset.tool);
      btn.classList.toggle('on', t.mode === tool.mode && (t.mode === 'eraser' || t.color === tool.color));
    }
  };
  for (const t of tools) {
    bar.append(h('button', {
      type: 'button', class: 'tool', 'data-tool': t.id, title: t.title, 'aria-label': t.title,
      onclick: () => {
        tool.mode = t.mode;
        if (t.color) tool.color = t.color;
        sync();
      },
    }, t.label));
  }
  bar.append(h('button', { type: 'button', class: 'tool', title: '되돌리기', 'aria-label': '되돌리기', onclick: undo }, '↶'));
  sync();
  return bar;
}

async function sheetPage(id) {
  const sheet = await loadSheet(id);
  const summary = h('div', { class: 'summary' });
  const updateSummary = () => {
    const s = score(sheet);
    summary.replaceChildren(
      h('span', {}, `채점 ${s.done}/${s.total}`),
      h('strong', {}, scoreLine(s)),
    );
  };
  updateSummary();

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return [
    topbar(backLink(), h('span', { class: 'topbar-title' }, sheet.title), toolbar()),
    h('article', { class: 'paper' },
      h('div', { class: 'paper-head' },
        h('div', {},
          h('span', { class: 'level' }, sheet.level),
          h('h2', {}, sheet.title),
          sheet.subtitle && h('p', { class: `subtitle lang-${sheet.lang}`, lang: sheet.lang }, sheet.subtitle),
        ),
        h('div', { class: 'date' }, today),
      ),
      sheet.goal && h('p', { class: 'goal' }, `🎯 ${sheet.goal}`),
      renderSheet(sheet, { onMark: updateSummary }),
      h('footer', { class: 'paper-foot' },
        summary,
        h('button', {
          type: 'button',
          class: 'chip',
          onclick: async () => {
            if (!confirm('이 학습지의 손글씨와 채점을 모두 지울까요?')) return;
            clearMarks(sheet.id);
            await clearInk(`${sheet.id}/`);
            route();
          },
        }, '처음부터 다시'),
      ),
    ),
  ];
}

// --- 오답노트 ---

async function reviewPage() {
  const index = await loadIndex();
  const marks = allMarks();
  const blocks = [];
  for (const lang of index.languages) {
    for (const id of lang.sheets) {
      const wrong = Object.entries(marks[id] ?? {}).filter(([, v]) => v === 'x' || v === 't').map(([k]) => k);
      if (!wrong.length) continue;
      const sheet = await loadSheet(id).catch(() => null);
      if (!sheet) continue;
      blocks.push(h('article', { class: 'paper' },
        h('div', { class: 'paper-head' },
          h('div', {}, h('span', { class: 'level' }, lang.name), h('h2', {}, sheet.title)),
          h('a', { class: 'chip', href: `#/ws/${id}` }, '학습지 열기'),
        ),
        renderSheet(sheet, { only: new Set(wrong), inkPrefix: 'review/' }),
      ));
    }
  }
  return [
    topbar(backLink(), h('span', { class: 'topbar-title' }, '오답노트'), toolbar()),
    h('p', { class: 'page-desc' }, '✕나 △로 표시한 문제가 모여 있어요. 다시 풀고 ○를 누르면 다음부터 빠져요.'),
    blocks.length ? blocks : h('div', { class: 'empty' }, h('p', {}, '틀린 문제가 없어요 🎉')),
  ];
}

// --- 설정 ---

function radioGroup(name, value, options, onChange) {
  return h('div', { class: 'radios' }, options.map((o) => h('label', { class: 'radio' },
    h('input', { type: 'radio', name, value: o.value, checked: o.value === value, onchange: () => onChange(o.value) }),
    h('span', {}, h('strong', {}, o.label), o.desc && h('small', {}, o.desc)),
  )));
}

function settingsPage() {
  const s = getSettings();
  return [
    topbar(backLink(), h('span', { class: 'topbar-title' }, '설정')),
    h('article', { class: 'paper settings' },
      h('h3', {}, '필기 입력'),
      radioGroup('input', s.input, [
        { value: 'auto', label: '자동 (추천)', desc: '펜을 쓰기 시작하면 손가락·손바닥 터치는 무시하고 스크롤로 써요.' },
        { value: 'pen', label: '펜만', desc: '처음부터 펜으로만 필기해요.' },
        { value: 'all', label: '손가락도 필기', desc: '펜이 없을 때 써요.' },
      ], (v) => setSetting('input', v)),
      h('h3', {}, '펜 굵기'),
      radioGroup('width', String(s.width), [
        { value: '2', label: '가늘게' },
        { value: '3', label: '보통' },
        { value: '4.5', label: '굵게' },
      ], (v) => setSetting('width', Number(v))),
      h('h3', {}, '기록'),
      h('button', {
        type: 'button',
        class: 'chip danger',
        onclick: async () => {
          if (!confirm('모든 손글씨와 채점 기록을 지울까요? 되돌릴 수 없어요.')) return;
          clearAllMarks();
          await clearInk();
          location.hash = '#/';
        },
      }, '모든 기록 지우기'),
    ),
  ];
}

// --- 라우터 ---

let routeToken = 0;

async function route() {
  const token = ++routeToken;
  const hash = location.hash.replace(/^#\/?/, '');
  resetUndo();
  let view;
  try {
    if (hash.startsWith('ws/')) view = await sheetPage(decodeURIComponent(hash.slice(3)));
    else if (hash === 'review') view = await reviewPage();
    else if (hash === 'settings') view = settingsPage();
    else view = await homePage();
  } catch (err) {
    view = errorView(err);
  }
  if (token !== routeToken) return;
  app.replaceChildren(...[view].flat(Infinity));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
