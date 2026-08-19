import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/**
 * 배포(Render 등) §단일 오리진 서빙 — `npm run build`가 만드는 `dist/client` 정적 자산을
 * 이 서버가 직접 서빙한다. `/api/v1/*`(historyApi)와 WebSocket 업그레이드(netServer)는
 * 이 핸들러보다 먼저 처리되므로 여기서는 그 외 모든 요청만 본다.
 */

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveSafePath(root: string, urlPath: string): string {
  // '..'/빈 세그먼트를 제거해 정적 루트 밖으로 벗어나는 경로 탈출을 막는다.
  const segments = urlPath.split('/').filter((seg) => seg !== '' && seg !== '..');
  return join(root, ...segments);
}

/** 정적 파일을 서빙하거나, 매칭되는 파일이 없으면 index.html로 폴백한다(true=응답 완료). */
export async function serveStatic(req: IncomingMessage, res: ServerResponse, clientDist: string): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const url = new URL(req.url ?? '/', 'http://internal');
  const requestedPath = resolveSafePath(clientDist, url.pathname === '/' ? '/index.html' : url.pathname);

  try {
    const data = await readFile(requestedPath);
    res.writeHead(200, { 'content-type': MIME_TYPES[extname(requestedPath)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
    return true;
  } catch {
    try {
      const indexHtml = await readFile(join(clientDist, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : indexHtml);
      return true;
    } catch {
      return false;
    }
  }
}
