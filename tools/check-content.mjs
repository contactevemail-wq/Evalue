// 학습지 JSON 검사: node tools/check-content.mjs
// index.json에 등록된 파일이 모두 있는지, 각 문항에 필요한 필드가 있는지 확인한다.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../content/', import.meta.url).pathname;
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const REQUIRED = {
  note: [],
  dialogue: ['lines'],
  kana: ['char', 'romaji'],
  write: ['prompt', 'answer'],
};

const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
const listed = new Set();

for (const lang of index.languages) {
  for (const id of lang.sheets) {
    listed.add(id);
    let sheet;
    try {
      sheet = JSON.parse(readFileSync(join(root, `${id}.json`), 'utf8'));
    } catch (err) {
      fail(id, `파일을 읽을 수 없음 (${err.message})`);
      continue;
    }
    if (sheet.lang !== lang.code) fail(id, `lang이 "${lang.code}"가 아님`);
    for (const key of ['level', 'title', 'sections']) if (!sheet[key]) fail(id, `${key} 없음`);
    (sheet.sections ?? []).forEach((section, si) => {
      if (!section.title) fail(`${id} 섹션 ${si}`, 'title 없음');
      (section.items ?? []).forEach((item, ii) => {
        const where = `${id} 섹션 ${si} 문항 ${ii}`;
        const required = REQUIRED[item.type];
        if (!required) return fail(where, `알 수 없는 type "${item.type}"`);
        for (const key of required) if (item[key] == null) fail(where, `${key} 없음`);
        if (item.type === 'note' && !item.text && !item.examples) fail(where, 'text나 examples가 필요함');
      });
    });
  }
}

for (const dir of readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(join(root, dir.name))) {
    const id = `${dir.name}/${file.replace(/\.json$/, '')}`;
    if (file.endsWith('.json') && !listed.has(id)) fail(id, 'index.json에 등록되지 않음');
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`학습지 ${listed.size}개 확인 완료`);
