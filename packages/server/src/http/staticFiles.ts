import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';

/**
 * 배포(Render 등) §Outbound Bandwidth 극대화 최적화 서빙:
 * 1. Brotli / Gzip 압축 전송 (텍스트 및 JSON, JS, CSS 최대 75% 이상 용량 절감)
 * 2. ETag 및 If-None-Match 304 Not Modified 지원 (불필요한 재전송 0 바이트)
 * 3. Cache-Control (assets/models/sound 등 불변 자산 1년 캐싱, index.html 304 검증)
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
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.gltf', '.txt']);

interface CachedFile {
  raw: Buffer;
  gzip?: Buffer | undefined;
  br?: Buffer | undefined;
  etag: string;
  mtimeMs: number;
  size: number;
}

// 메모리 캐시 (프로덕션 서빙 시 디스크 I/O 및 압축 연산 반복 방지)
const fileCache = new Map<string, CachedFile>();

function resolveSafePath(root: string, urlPath: string): string {
  const segments = urlPath.split('/').filter((seg) => seg !== '' && seg !== '..');
  return join(root, ...segments);
}

function computeEtag(buffer: Buffer): string {
  const hash = createHash('sha1').update(buffer).digest('base64url');
  return `"${buffer.length.toString(16)}-${hash}"`;
}

async function getCachedFile(filePath: string): Promise<CachedFile | null> {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) return null;

    const cached = fileCache.get(filePath);
    if (cached !== undefined && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      return cached;
    }

    const raw = await readFile(filePath);
    const etag = computeEtag(raw);
    const ext = extname(filePath).toLowerCase();

    let gzip: Buffer | undefined;
    let br: Buffer | undefined;

    // 압축 대상 파일이고 256바이트 이상인 경우 압축 버퍼 생성 및 캐시
    if (COMPRESSIBLE_EXTS.has(ext) && raw.length > 256) {
      try {
        gzip = gzipSync(raw, { level: 6 });
      } catch {
        // 압축 실패 시 무시
      }
      try {
        br = brotliCompressSync(raw);
      } catch {
        // 압축 실패 시 무시
      }
    }

    const item: CachedFile = { raw, gzip, br, etag, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
    fileCache.set(filePath, item);
    return item;
  } catch {
    return null;
  }
}

/** 정적 파일을 최적화하여 서빙 (true=응답 완료) */
export async function serveStatic(req: IncomingMessage, res: ServerResponse, clientDist: string): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const url = new URL(req.url ?? '/', 'http://internal');
  // Serve nested static microsites through their conventional directory index.
  // Without this, `/hellsing_story_v2/` misses the directory and incorrectly
  // falls through to the main SPA shell.
  const pathname = url.pathname === '/'
    ? '/index.html'
    : url.pathname.endsWith('/')
      ? `${url.pathname}index.html`
      : url.pathname;
  let targetPath = resolveSafePath(clientDist, pathname);

  let file = await getCachedFile(targetPath);
  let isFallback = false;

  // 파일이 없으면 SPA 폴백 (index.html)
  if (file === null) {
    targetPath = join(clientDist, 'index.html');
    file = await getCachedFile(targetPath);
    isFallback = true;
    if (file === null) return false;
  }

  const ext = extname(targetPath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
  const cacheControl = getCacheControl(pathname, isFallback);

  // 1. ETag & If-None-Match 304 처리 (대역폭 0 바이트 반환)
  const clientEtag = req.headers['if-none-match'];
  if (clientEtag !== undefined && clientEtag === file.etag) {
    res.writeHead(304, {
      ETag: file.etag,
      'Cache-Control': cacheControl,
    });
    res.end();
    return true;
  }

  // Allow interrupted model/media downloads to resume without retransferring
  // the entire asset. Byte ranges are served from the raw representation.
  const range = req.headers.range;
  if (range !== undefined && (req.headers['if-range'] === undefined || req.headers['if-range'] === file.etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match !== null) {
      const startText = match[1] ?? '';
      const endText = match[2] ?? '';
      let start = startText === '' ? Math.max(0, file.raw.length - Number(endText)) : Number(startText);
      let end = endText === '' ? file.raw.length - 1 : Number(endText);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= file.raw.length || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${file.raw.length}`, ETag: file.etag, 'Cache-Control': cacheControl });
        res.end();
        return true;
      }
      end = Math.min(end, file.raw.length - 1);
      const body = file.raw.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Length': body.length,
        'Content-Range': `bytes ${start}-${end}/${file.raw.length}`,
        'Accept-Ranges': 'bytes',
        ETag: file.etag,
        'Cache-Control': cacheControl,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return true;
    }
  }

  // 2. 압축 인코딩 결정 (Brotli 우선, Gzip 차선)
  const acceptEncoding = (req.headers['accept-encoding'] ?? '') as string;
  let body = file.raw;
  const headers: Record<string, string | number> = {
    'Content-Type': mime,
    ETag: file.etag,
    'Cache-Control': cacheControl,
    'Accept-Ranges': 'bytes',
    Vary: 'Accept-Encoding',
  };

  if (file.br !== undefined && acceptEncoding.includes('br')) {
    headers['Content-Encoding'] = 'br';
    body = file.br;
  } else if (file.gzip !== undefined && acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    body = file.gzip;
  }

  headers['Content-Length'] = body.length;

  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

function getCacheControl(pathname: string, isFallback: boolean): string {
  if (isFallback || pathname === '/index.html' || pathname === '/') {
    // index.html은 항상 ETag 검증(304)을 유도하여 즉각적인 배포 반영 보장
    return 'public, max-age=0, must-revalidate';
  }
  if (pathname.startsWith('/assets/') || pathname.startsWith('/models/') || pathname.startsWith('/sound/') || pathname.startsWith('/env/')) {
    // 불변 정적 자산(1년 캐싱) — 브라우저 캐시에서 즉시 로드하여 아웃바운드 트래픽 100% 절감
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=86400';
}
