// 작은 DOM 헬퍼: h('div', { class: 'x', onclick }, '텍스트', child)

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// "**굵게**" 표시만 지원하는 간단한 서식
export function rich(text) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? h('strong', {}, part) : part));
}
