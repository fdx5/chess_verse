import { createServer } from 'node:http';
import { attachNetServer } from './netServer.js';

const PORT = Number(process.env['PORT'] ?? 8787);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Battle Chess Reforged — authoritative server\n');
});

attachNetServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
