# Battle Chess Reforged

3D 체스 게임. 절차적으로 생성된 기물, 기물별 전투 연출, 로컬/CPU/온라인 대전, 전적 기록을 갖춘 브라우저 기반 체스 클라이언트와 권위 서버로 구성된 TypeScript 모노레포입니다.

## 특징

- **완전한 체스 규칙 엔진** — 캐슬링·앙파상·프로모션 포함, perft 검증 완료
- **절차적 3D 기물** — Three.js로 코드에서 직접 생성한 6종 유닛(폰/나이트/비숍/룩/퀸/킹), 진영별 재질·문장
- **기물별 전투 연출** — 폰(창 찌르기)·나이트(참격)·비숍(낙뢰)·룩(프레스)·퀸(파쇄) 등 공격자 타입마다 고유한 처치 애니메이션
- **4단계 CPU AI** — Web Worker에서 동작하는 negamax + alpha-beta + TT 기반 엔진, 오프닝북 포함
- **온라인 대전** — WebSocket 기반 권위 서버, 재접속, Bo1/Bo3 매치 진행
- **전적 영속화** — 오프라인 우선(IndexedDB) 저장 + 서버(SQLite) 동기화
- **모바일 대응** — 터치 드래그 이동, 반응형 레이아웃
- **360도 배경, BGM, 성능 오버레이** 등 부가 연출

## 모노레포 구조

```
packages/
  chess-core/   순수 체스 규칙 엔진(수 생성, 이동 적용, FEN/SAN, perft) — three.js 의존 없음
  protocol/     클라이언트·서버가 공유하는 네트워크 메시지/DTO 타입
  client/       Vite + Three.js 3D 클라이언트(브라우저에서 실행)
  server/       WebSocket 대전 서버 + REST 전적 API(Node.js, better-sqlite3)
```

## 시작하기

```bash
npm install

# 클라이언트 dev 서버(vite)
npm run dev --workspace=packages/client

# 대전/전적 서버
npm run dev --workspace=packages/server
```

기본적으로 클라이언트는 `http://localhost:5173`, 서버는 `:8787`에서 뜹니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run build` | 클라이언트 정적 빌드(`dist/client`) |
| `npm start` | 프로덕션 서버 기동(빌드된 클라이언트를 같은 오리진에서 함께 서빙) |
| `npm test` | 전체 테스트(vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 프로젝트 전체 타입 검사 |

## 배포

`npm run build` 후 `npm start`로 단일 프로세스가 정적 클라이언트와 API/WebSocket을 같은 오리진에서 서빙합니다(별도 프론트엔드 호스팅 불필요). Render.com 등 Node 웹 서비스에 Build Command `npm install && npm run build`, Start Command `npm start`로 배포할 수 있습니다. Node 버전은 `.node-version`을 따릅니다.

환경 변수(둘 다 선택):

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 서버 리스닝 포트 |
| `BCR_DB_PATH` | `packages/server/data/bcr.sqlite` | SQLite 파일 경로(영구 디스크 마운트 시 지정) |

## 라이선스 / 에셋 출처

360도 배경 이미지는 [Poly Haven](https://polyhaven.com)(CC0) 및 [HDRMaps](https://hdrmaps.com)(무료 라이선스) 파노라마를 사용했습니다.
