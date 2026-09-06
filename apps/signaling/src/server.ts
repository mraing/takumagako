/**
 * 信令服务器：ws://localhost:8787。
 * 只转发 offer/answer/ice，不读业务内容；房间规则见 room.ts。
 * GET /health → 200（供 E2E 健康检查）。
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { decodeSignal, encodeSignal, type SignalMsg } from '@takumagako/protocol';
import { handleSignal, RoomHub, type SignalSocket } from './room';

const PORT = Number(process.env.PORT ?? 8787);

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const hub = new RoomHub();
const wss = new WebSocketServer({ server: http });

function asSignalSocket(ws: WebSocket, ip: string): SignalSocket & { ws: WebSocket } {
  const s: SignalSocket = {
    id: randomUUID(),
    ip,
    send: (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(encodeSignal(msg));
    },
    close: () => ws.close(),
  };
  return { ...s, ws };
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const socket = asSignalSocket(ws, ip);
  hub.attach(socket);
  ws.on('message', (data) => {
    try {
      const msg = decodeSignal(String(data));
      handleSignal(hub, socket, msg);
    } catch {
      socket.send({ t: 'error', reason: '非法信令消息' });
    }
  });
  ws.on('close', () => hub.detach(socket));
});

http.listen(PORT, () => {
  console.log(`[signaling] ws://0.0.0.0:${PORT} (health: GET /health)`);
});
