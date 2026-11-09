살핌 배포 안내 (v0.3)

━━ A. 기본 배포 (맥락 확인 없이) ━━
1. 압축을 풀면 salpim 폴더가 나옵니다.
2. https://app.netlify.com/drop 에 salpim 폴더를 통째로 끌어다 놓습니다.
3. 생긴 주소로 누구나 계정 없이 사용할 수 있습니다.
   이 방식에서는 '맥락까지 살펴보기' 버튼을 누르면 "설치되어 있지 않아요" 안내가 나옵니다. 나머지 기능은 그대로 동작합니다.

━━ B. 맥락 확인(AI)까지 켜기 ━━
끌어다 놓기(Drop) 방식은 서버 함수를 올리지 않으므로, 한 번만 아래처럼 GitHub에 올려 연결합니다.

[준비] Anthropic API 키
1. https://console.anthropic.com 에서 기관 계정으로 로그인, 결제수단(기관 카드) 등록
2. API Keys 메뉴에서 키 발급 (sk-ant-… 로 시작, 외부 공유 금지)
3. 꼭 해 둘 것: Limits(사용 한도)에서 월 사용 한도 설정 (예: 월 50달러). 넘으면 멈출 뿐 추가 과금이 없습니다.

[배포] GitHub 연결 (설치 없이 브라우저로만, 처음 한 번)
1. github.com 가입·로그인 → 오른쪽 위 + → New repository
   - 이름: salpim / Private 선택 → Create repository
2. 만들어진 화면에서 "uploading an existing file" 클릭
3. 탐색기에서 salpim 폴더를 열고, 그 "안의 파일과 폴더 전부"를 선택해 끌어다 놓기
   (salpim 폴더 자체가 아니라 안의 내용물 — index.html이 맨 위에 있어야 함)
4. 업로드가 끝나면 아래 Commit changes 클릭
5. app.netlify.com → Add new project → Import an existing project → GitHub
   → 권한 승인 → salpim 저장소 선택
   - Build command: 비워두기 / Publish directory: 비워두기(또는 .) → Deploy
6. 사이트 화면 > Project configuration > Environment variables > Add a variable
   - ANTHROPIC_API_KEY = 발급받은 키
   - (선택) SALPIM_MODEL = claude-sonnet-5-5  (비용을 더 줄이려면 claude-haiku-5-5)
7. Deploys 메뉴 > Trigger deploy > Deploy project  (키를 반영하려면 한 번 더 배포)
8. Site configuration > Change site name 에서 주소를 salpim-kywa 등으로 변경

이후 수정할 때: GitHub 저장소에서 파일을 다시 올리면 Netlify가 자동으로 새로 배포합니다.

※ 회사망에서 명령 프롬프트(npm)를 쓰면 보안 인증서 문제(SELF_SIGNED_CERT_IN_CHAIN)로 막힐 수 있어 위 방법을 권합니다.

━━ 맥락 확인이 보내는 것 ━━
- 문서 전체가 아니라, 살핌이 찾은 후보 문장과 해당 기준만 보냅니다(표현 하나당 최대 8곳).
- 사용자가 '맥락까지 살펴보기'를 눌렀을 때만 보냅니다.
- 개인정보·비공개 정보가 담긴 문서는 기관 정보보안 기준에 따라 판단해 주세요.
- 비용 감(참고): 270쪽 매뉴얼 한 건 약 50~100원(Sonnet 기준).

참고
- index.html을 더블클릭해서 열면 동작하지 않습니다. 반드시 웹 주소로 열어주세요.
- 기준을 고치려면 criteria.js, AI 판단 지침을 고치려면 netlify/functions/review.mjs 를 수정합니다.
- 포함된 공개 라이브러리: pdf.js(Apache-2.0), JSZip(MIT) — vendor 폴더의 LICENSE 파일 참고
