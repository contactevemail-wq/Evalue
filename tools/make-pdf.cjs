// 학습지 JSON → 노트앱용 PDF (아이패드 화면 비율)
//
//   node tools/make-pdf.cjs ja/11-katakana-day1 ja/12-katakana-day2
//   node tools/make-pdf.cjs --bundle katakana-week1 ja/11-katakana-day1 ... ja/17-katakana-day7
//
// 학습지마다 pdf/<id>.pdf 를 만든다. --bundle 이름 을 주면 여러 학습지를 pdf/<이름>.pdf 한 파일로 묶는다.
// 손글씨 칸은 노트앱에서 펜으로 쓰고, 정답·해설은 각 학습지 맨 뒤 페이지에 모은다.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pdf');

// iPad(10세대·Air 11") 화면 비율 1640:2360
const PAGE = { width: '164mm', height: '236mm' };
const CONTENT_MM = 164 - 2 * 12;
const MAX_CELL_MM = 14;
const KANA_LABEL_MM = 22;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const paras = (s) => (s ?? '').split('\n').filter(Boolean).map((p) => `<p>${rich(p)}</p>`).join('');
const isKo = (s) => /[가-힣]/.test(s);
const langSpan = (text, lang) => `<span class="lang-${isKo(text) ? 'ko' : lang}">${rich(text)}</span>`;

function grid(cells, cols, guides = [], cellMm) {
  const size = cellMm ?? Math.min(MAX_CELL_MM, CONTENT_MM / cols);
  const boxes = Array.from({ length: cells }, (_, i) => `<div class="cell">${guides[i] ? `<span>${esc(guides[i])}</span>` : ''}</div>`);
  return `<div class="grid" style="--cell:${size.toFixed(2)}mm;grid-template-columns:repeat(${cols}, var(--cell))">${boxes.join('')}</div>`;
}

function lines(count, short) {
  return `<div class="lines${short ? ' short' : ''}">${'<div></div>'.repeat(count)}</div>`;
}

function renderNote(item, lang) {
  const cards = item.style === 'cards';
  const examples = (item.examples ?? []).map((ex) => cards
    ? `<li><span class="card-text lang-${lang}">${esc(ex.text)}</span><small>${esc(ex.ko)}</small></li>`
    : `<li><span class="ex-text lang-${lang}">${esc(ex.text)}</span>${ex.ko ? `<small>${esc(ex.ko)}</small>` : ''}</li>`);
  return `<div class="note">${item.title ? `<h4>${esc(item.title)}</h4>` : ''}${paras(item.text)}${examples.length ? `<ul class="${cards ? 'cards' : 'examples'}">${examples.join('')}</ul>` : ''}</div>`;
}

function renderDialogue(item, lang) {
  const rows = item.lines.map((l) => `<div class="line"><span class="speaker">${esc(l.speaker)}</span><div><div class="said lang-${lang}">${esc(l.text)}</div><small>${esc(l.ko)}</small></div></div>`);
  return `<div class="dialogue">${item.title ? `<h4>${esc(item.title)}</h4>` : ''}${rows.join('')}</div>`;
}

function renderKana(item) {
  const trace = item.trace ?? 3;
  const cols = trace + (item.blank ?? 4);
  const cell = Math.min(MAX_CELL_MM, (CONTENT_MM - KANA_LABEL_MM) / cols);
  return `<div class="item kana"><div class="kana-label"><span class="kana-char lang-ja">${esc(item.char)}</span><b>${esc(item.romaji)}</b><small>${esc(item.ko)}</small></div>${grid(cols, cols, Array(trace).fill(item.char), cell)}</div>`;
}

function renderWrite(item, number, lang) {
  const answerLang = item.answerLang ?? item.lang ?? lang;
  const layout = item.layout ?? (answerLang === 'ja' ? 'grid' : 'lines');
  let surface;
  let half = false;
  if (layout === 'grid') {
    const cells = item.cells ?? [...item.answer].length;
    const cols = Math.min(cells, item.cols ?? 10);
    surface = grid(cells, cols);
    half = cols * MAX_CELL_MM <= CONTENT_MM / 2 - 4 && [...item.prompt].length <= 12;
  } else {
    surface = lines(item.lines ?? 1, item.short);
    half = Boolean(item.short);
  }
  const prompt = item.prompt.split(/(_{2,})/).map((part, i) => (i % 2 ? '<span class="blank"></span>' : langSpan(part, item.lang ?? lang))).join('');
  return `<div class="item write${half ? ' half' : ''}"><div class="prompt"><span class="num">${number}.</span><div><div class="prompt-text">${prompt}</div>${item.hint ? `<div class="hint">${rich(item.hint)}</div>` : ''}</div></div>${surface}</div>`;
}

function renderAnswers(sheet) {
  const blocks = [];
  for (const section of sheet.sections) {
    const rows = [];
    let n = 0;
    for (const item of section.items) {
      if (item.type === 'dialogue') {
        rows.push(...item.lines.map((l) => `<li class="plain"><span class="lang-${sheet.lang}">${esc(l.text)}</span> — ${esc(l.ko)}</li>`));
      }
      if (item.type !== 'write' && item.type !== 'kana') continue;
      n++;
      if (item.type !== 'write') continue;
      const lang = item.answerLang ?? item.lang ?? sheet.lang;
      rows.push(`<li><b>${n}.</b> ${item.example ? '<em>예시</em> ' : ''}<span class="ans lang-${lang}">${esc(item.answer)}</span>`
        + (item.alts?.length ? `<div class="alts">이렇게 써도 돼요: ${item.alts.map((a) => `<span class="lang-${lang}">${esc(a)}</span>`).join(' / ')}</div>` : '')
        + (item.explain ? `<div class="explain">${rich(item.explain)}</div>` : '')
        + '</li>');
    }
    if (rows.length) blocks.push(`<h4>${esc(section.title)}</h4><ul class="answers">${rows.join('')}</ul>`);
  }
  return `<section class="answer-page"><h3>정답과 해설</h3>${blocks.join('')}</section>`;
}

function renderSheet(sheet) {
  const sections = sheet.sections.map((section) => {
    let number = 0;
    const body = section.items.map((item) => {
      if (item.type === 'note') return renderNote(item, sheet.lang);
      if (item.type === 'dialogue') return renderDialogue(item, sheet.lang);
      if (item.type === 'kana') { number++; return renderKana(item); }
      if (item.type === 'write') { number++; return renderWrite(item, number, sheet.lang); }
      return '';
    }).join('');
    return `<section><div class="section-head"><h3>${esc(section.title)}</h3>${section.desc ? `<p class="desc">${rich(section.desc)}</p>` : ''}</div><div class="body">${body}</div></section>`;
  }).join('');

  return `<article class="sheet">
    <header>
      <div><span class="level">${esc(sheet.level)}</span><h2>${esc(sheet.title)}</h2>${sheet.subtitle ? `<p class="subtitle lang-${sheet.lang}">${esc(sheet.subtitle)}</p>` : ''}</div>
      <div class="meta">날짜 ________<br>○ ____ / ✕ ____</div>
    </header>
    ${sheet.goal ? `<p class="goal">🎯 ${esc(sheet.goal)}</p>` : ''}
    ${sections}
    ${renderAnswers(sheet)}
  </article>`;
}

const CSS = `
@page { size: ${PAGE.width} ${PAGE.height}; margin: 12mm 12mm 13mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1d2433; font: 10pt/1.55 "Noto Sans KR", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.lang-ja { font-family: "Klee One", "Noto Sans JP", serif; }
strong { font-weight: 700; }
small { color: #6b7280; }
.sheet + .sheet { break-before: page; }
header { display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; padding-bottom: 3mm; border-bottom: 0.6mm solid #1d2433; }
header h2 { margin: 1mm 0 0; font-size: 17pt; line-height: 1.25; }
.subtitle { margin: 0.5mm 0 0; font-size: 12pt; color: #6b7280; letter-spacing: 0.5mm; }
.level { display: inline-block; padding: 0.3mm 2.5mm; border-radius: 3mm; background: #e3f0eb; color: #2f6f5e; font-size: 8pt; font-weight: 700; }
.meta { font-size: 8.5pt; color: #6b7280; text-align: right; line-height: 1.9; white-space: nowrap; }
.goal { margin: 3mm 0 0; padding: 2mm 3mm; border-radius: 2mm; background: #e3f0eb; font-size: 9.5pt; }
section { margin-top: 6mm; }
h3 { margin: 0 0 1mm; font-size: 12.5pt; }
/* 제목이 페이지 맨 아래에 혼자 남지 않도록, 제목 아래 45mm를 같이 붙여 둔다 */
.section-head { break-inside: avoid; }
.section-head::after { content: ''; display: block; height: 45mm; margin-bottom: -45mm; }
.desc { margin: 0 0 2mm; color: #6b7280; font-size: 9pt; break-after: avoid; }
.note { margin: 2.5mm 0; padding: 3mm 3.5mm; border-left: 1mm solid #2f6f5e; background: #f5f8f4; break-inside: avoid; }
.note h4 { margin: 0 0 1mm; font-size: 10pt; }
.note p { margin: 0.6mm 0; }
.examples { list-style: none; margin: 2mm 0 0; padding: 0; }
.examples li { margin: 1mm 0; }
.ex-text { font-size: 12pt; font-weight: 600; margin-right: 2.5mm; }
.cards { list-style: none; margin: 2.5mm 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; }
.cards li { display: flex; flex-direction: column; align-items: center; padding: 1.5mm 0; border: 0.25mm solid #e8e1d4; border-radius: 2mm; background: #fff; }
.card-text { font-size: 22pt; line-height: 1.2; }
.cards small { font-size: 7.5pt; }
.dialogue { margin: 2mm 0; padding: 2mm 3.5mm; border: 0.25mm solid #e8e1d4; border-radius: 2.5mm; }
.line { display: flex; gap: 3mm; padding: 1.6mm 0; border-top: 0.25mm dashed #e8e1d4; break-inside: avoid; }
.line:first-of-type { border-top: 0; }
.speaker { flex: none; width: 11mm; padding: 0.3mm 0; border-radius: 1.5mm; background: #f4efe6; font-size: 8pt; font-weight: 700; text-align: center; align-self: flex-start; }
.said { font-size: 12.5pt; }
.line small { font-size: 8pt; }
.body { display: flex; flex-wrap: wrap; column-gap: 6mm; }
.body > * { width: 100%; }
.body > .half { width: calc(50% - 3mm); }
.item { padding: 2.5mm 0; border-top: 0.25mm solid #eee8dc; break-inside: avoid; }
.kana { display: flex; align-items: center; gap: 0; }
.kana-label { width: ${KANA_LABEL_MM}mm; flex: none; display: flex; flex-direction: column; align-items: center; line-height: 1.25; }
.kana-char { font-size: 20pt; }
.kana-label small { font-size: 7pt; }
.prompt { display: flex; gap: 2mm; margin-bottom: 2mm; }
.num { font-weight: 700; }
.prompt-text { font-size: 11.5pt; font-weight: 600; }
.prompt-text .lang-ja { font-size: 13pt; }
.blank { display: inline-block; width: 16mm; height: 1em; border-bottom: 0.4mm solid #1d2433; margin: 0 1mm; vertical-align: -0.15em; }
.hint { font-size: 8.5pt; color: #6b7280; }
.grid { display: grid; border-top: 0.3mm solid #e2ab96; border-left: 0.3mm solid #e2ab96; width: max-content; background: #fff; }
.cell { position: relative; width: var(--cell); height: var(--cell); border-right: 0.3mm solid #e2ab96; border-bottom: 0.3mm solid #e2ab96;
  background-image: repeating-linear-gradient(to right, #f1cfc2 0 0.8mm, transparent 0.8mm 1.6mm), repeating-linear-gradient(to bottom, #f1cfc2 0 0.8mm, transparent 0.8mm 1.6mm);
  background-size: 100% 0.2mm, 0.2mm 100%; background-position: 0 50%, 50% 0; background-repeat: no-repeat; }
.cell span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: "Klee One", serif; font-size: calc(var(--cell) * 0.72); color: rgba(29, 36, 51, 0.18); line-height: 1; padding-top: calc(var(--cell) * 0.04); }
.lines div { height: 11mm; border-bottom: 0.3mm solid #b8c5d6; background: linear-gradient(#fff 0 0); }
.lines.short { width: 100%; }
.answer-page { break-before: page; margin-top: 0; }
.answer-page h3 { padding-bottom: 2mm; border-bottom: 0.6mm solid #d6336c; color: #d6336c; }
.answer-page h4 { margin: 4mm 0 1mm; font-size: 9.5pt; color: #6b7280; }
.answers { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 6mm; }
.answers li { margin: 0 0 1.6mm; break-inside: avoid; font-size: 9.5pt; }
.answers li.plain { font-size: 8.5pt; }
.ans { color: #d6336c; font-weight: 600; font-size: 11pt; }
.answers em { font-style: normal; font-size: 7.5pt; color: #6b7280; }
.alts, .explain { font-size: 8pt; color: #4b5563; }
`;

function html(sheets) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+KR:wght@400;700&display=block">
  <style>${CSS}</style></head><body>${sheets.map(renderSheet).join('')}</body></html>`;
}

function loadSheet(id) {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error(`잘못된 학습지 id: ${id}`);
  return { ...JSON.parse(fs.readFileSync(path.join(ROOT, 'content', `${id}.json`), 'utf8')), id };
}

async function writePdf(page, sheets, file, title) {
  await page.setContent(html(sheets), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.pdf({
    path: file,
    ...PAGE,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7px;color:#9ca3af;text-align:center;font-family:sans-serif">${esc(title)} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    margin: { top: '12mm', bottom: '13mm', left: '12mm', right: '12mm' },
  });
  console.log(path.relative(ROOT, file));
}

(async () => {
  const args = process.argv.slice(2);
  const bundleAt = args.indexOf('--bundle');
  const bundle = bundleAt >= 0 ? args.splice(bundleAt, 2)[1] : null;
  if (!args.length) {
    console.error('사용법: node tools/make-pdf.cjs [--bundle 이름] <학습지 id>...');
    process.exit(1);
  }
  const sheets = args.map(loadSheet);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    if (bundle) await writePdf(page, sheets, path.join(OUT, `${bundle}.pdf`), bundle);
    else for (const sheet of sheets) await writePdf(page, [sheet], path.join(OUT, `${sheet.id}.pdf`), `${sheet.level} · ${sheet.title}`);
  } finally {
    await browser.close();
  }
})();
