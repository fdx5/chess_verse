import { createServer } from 'node:http';
import { join } from 'node:path';
import { attachNetServer } from './netServer.js';
import { openDatabase } from './db/connection.js';
import { PlayerRepository } from './db/PlayerRepository.js';
import { MatchRepository } from './db/MatchRepository.js';
import { HistoryQueries } from './db/HistoryQueries.js';
import { handleHistoryApiRequest } from './http/historyApi.js';
import { serveStatic } from './http/staticFiles.js';

const PORT = Number(process.env['PORT'] ?? 8787);
// process.cwd()는 `npm run dev --workspace=...`처럼 실행 위치에 따라 달라질 수 있어
// 항상 이 파일(packages/server/src) 기준 상대 경로로 고정한다(리포 루트/워크스페이스 어디서 띄워도 동일).
const DB_PATH = process.env['BCR_DB_PATH'] ?? join(import.meta.dirname, '../data/bcr.sqlite');
// 배포(Render 등) — 클라이언트 정적 빌드(`npm run build`가 만드는 `dist/client`)를 같은 서버·같은
// 오리진에서 서빙해 별도 포트/CORS/mixed-content 문제 없이 단일 도메인으로 서비스한다.
const CLIENT_DIST = process.env['BCR_CLIENT_DIST'] ?? join(import.meta.dirname, '../../../dist/client');

const db = openDatabase(DB_PATH);
const playerRepo = new PlayerRepository(db);
const matchRepo = new MatchRepository(db);
const historyQueries = new HistoryQueries(db);

const httpServer = createServer((req, res) => {
  void handleHistoryApiRequest(req, res, { playerRepo, matchRepo, historyQueries }).then(async (handled) => {
    if (handled) return;
    if (await serveStatic(req, res, CLIENT_DIST)) return;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Battle Chess Reforged — authoritative server\n');
  });
});

attachNetServer(httpServer, { playerRepo, matchRepo });

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT} (db: ${DB_PATH})`);
});

// 배포(Render 무료 플랜) §셀프 핑 — GitHub Actions 크론(.github/workflows/keep-alive.yml)은
// "best-effort" 스케줄러라 부하가 걸리면 수십 분씩 밀려(GitHub 공식 문서에 명시) Render의 15분
// 슬립 임계값을 놓치는 경우가 실제로 관측됨. 이 프로세스가 떠 있는 동안은 setInterval이 GitHub
// 크론 큐를 거치지 않고 정확한 주기로 실행되므로, 자신의 공개 URL을 주기적으로 호출해 인바운드
// 트래픽을 만들어 슬립을 막는다. RENDER_EXTERNAL_URL은 Render가 배포된 서비스에만 자동 주입하는
// 값이라 로컬 개발 환경에서는 자동으로 비활성화된다. (GitHub Actions 핑은 이 프로세스 자체가
// 다운됐을 때 다시 깨워주는 백업 역할로 계속 유지.)
const selfPingUrl = process.env['RENDER_EXTERNAL_URL'];
if (selfPingUrl !== undefined) {
  const SELF_PING_INTERVAL_MS = 5 * 60_000;
  setInterval(() => {
    fetch(selfPingUrl).catch((err: unknown) => {
      console.warn('[server] self-ping failed', err);
    });
  }, SELF_PING_INTERVAL_MS);
  console.log(`[server] self-ping enabled — pinging ${selfPingUrl} every ${SELF_PING_INTERVAL_MS / 60_000}min`);
}
