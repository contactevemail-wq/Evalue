# Evalue

태블릿에서 **펜으로 직접 쓰면서** 공부하는 영어·일본어 학습지 앱입니다.

- ✍️ 원고지 칸·줄 노트에 펜으로 필기 (필압 반영, 손바닥 무시, 획 지우개, 되돌리기)
- 🈁 히라가나 따라 쓰기: 흐린 글자 위에 따라 쓰고 빈칸에 혼자 쓰기
- 🔊 발음 듣기와 듣고 쓰기 (브라우저 내장 음성)
- ○ △ ✕ 스스로 채점, 🖍️ 빨간 펜으로 고치기
- 📒 오답노트: ✕·△ 문제만 모아서 다시 풀기
- 쓴 글씨와 채점은 기기에 자동 저장돼요. 오프라인에서도 동작해요.

## 실행

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

태블릿에서는 배포된 주소를 열고 **홈 화면에 추가**하면 앱처럼 쓸 수 있어요.

### Vercel 배포

1. [vercel.com/new](https://vercel.com/new)에서 GitHub의 `Evalue` 저장소를 **Import** 해요.
2. Framework Preset은 **Other** 그대로 두고 **Deploy**를 눌러요. 설정은 `vercel.json`에 들어 있어요.
3. 그다음부터는 GitHub에 푸시할 때마다 자동으로 다시 배포돼요.

### GitHub Pages 배포 (대안)

1. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 바꿔요.
2. `main` 브랜치에 푸시하면 `.github/workflows/pages.yml` 이 자동으로 배포해요.

## 학습지 추가

학습지는 `content/` 폴더의 JSON 파일이에요. 형식은 [CLAUDE.md](CLAUDE.md)에 정리돼 있어요.
Claude에게 "히라가나 な행 학습지 추가해줘"처럼 요청하면 됩니다. 추가한 뒤에는 아래 명령으로 검사해요.

```bash
node tools/check-content.mjs
```
