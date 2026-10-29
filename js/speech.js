// 발음 듣기: 브라우저 내장 음성 합성(Web Speech API)을 쓴다. 별도 비용 없음.

const LOCALES = { en: 'en-US', ja: 'ja-JP' };

export const canSpeak = 'speechSynthesis' in window;

function pickVoice(locale) {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === locale && v.localService)
    ?? voices.find((v) => v.lang === locale)
    ?? voices.find((v) => v.lang.startsWith(locale.slice(0, 2)));
}

function utter(text, lang, { pitch = 1 } = {}) {
  return new Promise((resolve) => {
    const locale = LOCALES[lang] ?? lang;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.rate = 0.85;
    u.pitch = pitch;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

export function speak(text, lang, options) {
  if (!canSpeak) return Promise.resolve();
  speechSynthesis.cancel();
  return utter(text, lang, options);
}

// 대화문 전체 듣기: 화자마다 음 높이를 조금 다르게 해서 구분한다.
export async function speakAll(lines, lang) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  for (const line of lines) {
    await utter(line.text, lang, { pitch: speakers.indexOf(line.speaker) % 2 ? 1.25 : 0.95 });
  }
}
