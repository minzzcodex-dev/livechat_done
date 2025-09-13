import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import { env } from './utils.js';
import { createSession, addMessage, getMessages, touchSession } from './db.js';
import { bot, bindEmitter, sendAdminCard, sendAdminImage } from './bot.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' })); // batas JSON untuk /api/session
app.use('/public', express.static('public'));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Create / restore session
app.post('/api/session', (req, res) => {
  const { sessionId, name, email } = (req.body as any) || {};
  if (sessionId) {
    touchSession(sessionId);
    return res.json({ sessionId, ok: true });
  }
  const s = createSession({
    visitor_name: name,
    visitor_email: email,
    user_agent: req.headers['user-agent'] as string,
    ip:
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      undefined,
  });
  return res.json({ sessionId: s.id, ok: true });
});

// History
app.get('/api/messages/:sid', (req, res) => {
  const msgs = getMessages(req.params.sid, 200);
  return res.json(msgs);
});

const server = http.createServer(app);

// ✅ Socket.IO dengan buffer lebih besar untuk base64 image
const io = new IOServer(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
  maxHttpBufferSize: 12 * 1024 * 1024, // 12 MB
});

// registry socket per session
const socketsBySession = new Map<string, Set<string>>();

// inject emitter ke bot
bindEmitter((sessionId: string, event: string, payload: unknown) => {
  const sockIds = socketsBySession.get(sessionId);
  if (!sockIds) return;
  for (const sid of sockIds) io.to(sid).emit(event, payload);
});


io.on('connection', (socket) => {
  socket.on('visitor:init', ({ sessionId }) => {
    if (!sessionId) return;
    let set = socketsBySession.get(sessionId);
    if (!set) {
      set = new Set();
      socketsBySession.set(sessionId, set);
    }
    set.add(socket.id);
  });

  socket.on('visitor:message', async ({ sessionId, text }) => {
    if (!sessionId || !text) return;
    addMessage(sessionId, 'visitor', text);
    await sendAdminCard(sessionId, text);
    socket.emit('visitor:ack', { ok: true });
  });

  socket.on('visitor:image', async ({ sessionId, data }) => {
    if (!sessionId || !data) return;
    console.log(
      `[image] received from ${sessionId}, length=${data.length}`
    );
    addMessage(sessionId, 'visitor', '[image]');
    await sendAdminImage(sessionId, data); // kirim ke Telegram
    socket.emit('visitor:ack', { ok: true }); // jangan broadcast balik
  });

  socket.on('disconnect', () => {
    for (const [sid, set] of socketsBySession.entries()) {
      set.delete(socket.id);
      if (!set.size) socketsBySession.delete(sid);
    }
  });
});

const PORT = Number(env('PORT', '8080'));
server.listen(PORT, async () => {
  console.log(`[livechat] listening on :${PORT}`);
  await bot.launch();
  console.log('[telegram] bot launched');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
