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
