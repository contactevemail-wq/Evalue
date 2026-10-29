// 학습지 불러오기: content/index.json 목록과 content/<id>.json 학습지 파일

let indexPromise;
const sheets = new Map();

export function loadIndex() {
  indexPromise ??= fetch('content/index.json').then((r) => {
    if (!r.ok) throw new Error('학습지 목록을 불러오지 못했어요.');
    return r.json();
  });
  return indexPromise;
}

export function loadSheet(id) {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) return Promise.reject(new Error('잘못된 학습지 주소예요.'));
  if (!sheets.has(id)) {
    sheets.set(id, fetch(`content/${id}.json`).then((r) => {
      if (!r.ok) throw new Error('학습지를 불러오지 못했어요.');
      return r.json();
    }).then((sheet) => ({ ...sheet, id })).catch((err) => {
      sheets.delete(id);
      throw err;
    }));
  }
  return sheets.get(id);
}

// 채점할 수 있는 문항(kana, write)만 [{ id, item, section }]로 펼친다.
export function gradableItems(sheet) {
  const out = [];
  sheet.sections.forEach((section, si) => {
    section.items.forEach((item, ii) => {
      if (item.type === 'kana' || item.type === 'write') out.push({ id: `${si}-${ii}`, item, section });
    });
  });
  return out;
}
