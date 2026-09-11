# 가천대학교 생성형 AI 활용 사례 공모전 홈페이지

GitHub Pages에서 바로 게시할 수 있는 한국어 정적 홈페이지입니다. 별도 설치나 빌드 과정이 필요 없습니다.

## 미리보기

`index.html`을 브라우저에서 열면 됩니다. 이메일 주소 복사 기능은 로컬 파일에서는 브라우저 보안 설정에 따라 제한될 수 있고, GitHub Pages의 HTTPS 환경에서 정상 동작합니다.

## GitHub Pages 게시

1. GitHub에 홈페이지용 저장소를 만듭니다.
2. 이 폴더 **안의 내용**을 저장소 최상위에 올립니다. `index.html`, `styles.css`, `script.js`, `assets/`, `.nojekyll`을 포함합니다.
3. 저장소 Settings → Pages → Build and deployment에서 **Deploy from a branch**를 선택합니다.
4. Branch는 `main`, 폴더는 `/(root)`를 선택하고 저장합니다.
5. Pages 화면에 표시되는 주소로 접속합니다. 모든 자원은 상대 경로이므로 프로젝트 저장소 주소에서도 동작합니다.

## 파일 구성

- `index.html`: 참가 안내, 분야, 일정, 시상, 심사, 제출 방법, FAQ 및 유의사항
- `styles.css`: 화면 크기별 배치, 인쇄, 동작 줄이기 설정
- `script.js`: 모바일 메뉴, 한국 시간 기준 접수 상태 자동 표시, 이메일 복사
- `assets/`: 중앙도서관 및 학교 로고
- `downloads/`: 공개용 자료 저장 위치

## 다운로드 자료를 추가할 때

공개용 파일을 `downloads/`에 저장합니다. 예: `application-form.pdf`, `case-examples.pdf`.
`index.html`의 해당 `.download-card`를 아래와 같이 실제 링크로 교체합니다.

```html
<a class="download-card" href="./downloads/application-form.pdf" download>
  <span><strong>참가신청서</strong><small>PDF · 팀원 정보 및 동의서</small></span>
  <span>다운로드 ↓</span>
</a>
```

## 참고

- 접수 상태는 방문자 기기의 시계를 기준으로 자동 표시됩니다.
- 일정을 변경할 때는 `index.html`의 `data-start`/`data-end`와 `script.js`의 접수 기간을 함께 수정합니다.
- 메일 작성 버튼은 메일 앱만 열며, 발송이나 파일 첨부를 자동으로 수행하지 않습니다.
