// src/bot.ts
import { Telegraf } from 'telegraf';
import { env, fmt } from './utils.js';
import { addMessage, listOpenSessions, closeSession } from './db.js';
import type * as tg from 'typegram';

const BOT_TOKEN = env('TELEGRAM_BOT_TOKEN');
const ADMIN_CHAT_ID = env('ADMIN_CHAT_ID');

export const bot = new Telegraf(BOT_TOKEN);

/* ----------------------- helpers ----------------------- */

// Coba ambil username & pertanyaan dari preview yang dikirim server
function parsePreview(previewRaw: string) {
  const preview = String(previewRaw || '');
  const isPrechat = /^\s*\[?\s*prechat\s*\]?/i.test(preview) || /^prechat/i.test(preview);

  let username: string | undefined;
  let pertanyaan: string | undefined;
  let message: string | undefined;

  const u = preview.match(/username:\s*([^\n]+)/i);
  if (u) username = u[1].trim();

  const q = preview.match(/pertanyaan:\s*([^\n]+)/i);
  if (q) pertanyaan = q[1].trim();

  if (!isPrechat) {
    // Untuk chat biasa, coba ambil pesan (fallback ke preview apa adanya)
    message = preview.replace(/^\s*username:[^\n]*\n?/i, '').trim() || preview;
  }

  return { isPrechat, username, pertanyaan, message };
}

function bold(txt: string) { return fmt.bold(txt); }
function code(txt: string) { return fmt.code(txt); }

// --- ganti fungsi ini saja ---

export const sendAdminCard = async (sessionId: string, preview: string) => {
  const site = process.env.SITE_NAME || 'McX Live Chat';

  // 1) Parse dari preview (untuk prechat)
  const { isPrechat, username: uFromPreview, pertanyaan, message } = (function parse(previewRaw: string) {
    const preview = String(previewRaw || '');
    const isPre = /^\s*\[?\s*prechat\s*\]?/i.test(preview) || /^prechat/i.test(preview);
    const u = preview.match(/username:\s*([^\n]+)/i)?.[1]?.trim();
    const q = preview.match(/pertanyaan:\s*([^\n]+)/i)?.[1]?.trim();
    const msg = isPre ? undefined : preview.replace(/^\s*username:[^\n]*\n?/i, '').trim() || preview;
    return { isPrechat: isPre, username: u, pertanyaan: q, message: msg };
  })(preview);

  // 2) Fallback: ambil nama dari DB (open sessions) berdasarkan sessionId
  let uFromDb: string | undefined;
  try {
    const sessions = listOpenSessions(200);                 // cari di cache DB lokal
    const s = sessions.find((x) => x.id === sessionId);
    if (s?.visitor_name) uFromDb = String(s.visitor_name);
  } catch { /* ignore */ }

  const username = uFromPreview || uFromDb || '-';

  // 3) Susun pesan
  let text: string;
  if (isPrechat) {
    text =
      `${fmt.bold(site)}\n` +
      `New Chat\n` +
      `username: ${username}\n` +
      `pertanyaan: ${pertanyaan || '-'}`;
  } else {
    text =
      `${fmt.bold(site)}\n` +
      `username: ${username}\n` +
      `${fmt.bold('Chat')}: ${message ?? preview}`;
  }

  // 4) Tombol (pakai username bila ada)
  const replyLabel = username && username !== '-' ? `Balas (${username})` : `Balas (${sessionId})`;

  await bot.telegram.sendMessage(ADMIN_CHAT_ID, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: replyLabel, callback_data: `use:${sessionId}` }],
        [
          { text: 'Chat Aktif', callback_data: 'list' },
          { text: '❌', callback_data: `close:${sessionId}` },
        ],
      ],
    },
  });
};


/** Kirim gambar dari visitor ke Telegram (dataURL/URL) */
export const sendAdminImage = async (sessionId: string, data: string) => {
  try {
    const m = /^data:(image\/[a-zA-Z0-9+.\-]+);base64,(.+)$/.exec(data || '');
    if (m) {
      const mime = m[1];
      const b64 = m[2];
      const buf = Buffer.from(b64, 'base64');
      const ext = (mime.split('/')[1] || 'png').toLowerCase();
      const canAsPhoto = mime !== 'image/webp' && buf.length <= 10 * 1024 * 1024;

      await bot.telegram.sendChatAction(ADMIN_CHAT_ID, canAsPhoto ? 'upload_photo' : 'upload_document');

      if (canAsPhoto) {
        await bot.telegram.sendPhoto(
          ADMIN_CHAT_ID,
          { source: buf, filename: `photo_${sessionId}.${ext}` },
          { caption: `Dari ${sessionId}` }
        );
      } else {
        await bot.telegram.sendDocument(
          ADMIN_CHAT_ID,
          { source: buf, filename: `image_${sessionId}.${ext}` },
          { caption: `Dari ${sessionId}` }
        );
      }
      return;
    }
    // treat as URL
    await bot.telegram.sendPhoto(ADMIN_CHAT_ID, data, { caption: `Image from session ${sessionId}` });
  } catch (err) {
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, `Gagal mengirim gambar untuk session ${sessionId}: ${String(err)}`);
  }
};

/* ----------------- state operator ----------------- */
let activeSessionId: string | null = null;

/* --- helper: ambil file Telegram → dataURL (untuk admin kirim gambar ke user) --- */
async function tgFileToDataUrl(fileId: string, mimeFallback = 'image/jpeg'): Promise<string> {
  const file = await bot.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  let mime = mimeFallback;
  const lower = String(file.file_path || '').toLowerCase();
  if (lower.endsWith('.png')) mime = 'image/png';
  else if (lower.endsWith('.webp')) mime = 'image/webp';
  else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';

  return `data:${mime};base64,${buf.toString('base64')}`;
}

/* ----------------- commands ----------------- */
bot.command('start', (ctx) =>
  ctx.reply('Operator ready. /ls, /use <sid>, /r <sid> <message>.')
);

// List chat aktif (tulisan & tombol pilih)
bot.command('ls', async (ctx) => {
  const sessions = listOpenSessions(50); // ambil lebih banyak
  if (!sessions.length) return ctx.reply('Tidak ada chat aktif.');

  const lines = sessions.map((s, i) =>
    `${i + 1}. ${code(s.id)} — ${s.visitor_name || '-'}`
  ).join('\n');

  await ctx.reply(`List Chat Active:\n${lines}`);
});

bot.command('use', async (ctx) => {
  const parts = ctx.message.text.split(/\s+/);
  const sid = parts[1];
  if (!sid) return ctx.reply('Usage: /use <sessionId>');
  activeSessionId = sid;
  return ctx.reply(`Active session: ${sid}`);
});

/* --------- kirim teks admin → user --------- */
export const routeAdminMessage = async (sessionId: string, text: string) => {
  addMessage(sessionId, 'admin', text);
  ioEmit?.(sessionId, 'admin:message', { text, at: new Date().toISOString() });
};

bot.command('r', async (ctx) => {
  const match = ctx.message.text.match(/^\/r\s+(\S+)\s+([\s\S]+)/);
  if (!match) return ctx.reply('Usage: /r <sessionId> <message>');
  const [, sid, text] = match;
  await routeAdminMessage(sid, text);
  return ctx.reply(`Sent to ${sid}`);
});

/* ----------------- inline keyboard ----------------- */
bot.on('callback_query', async (ctx) => {
  const cq = ctx.callbackQuery as tg.CallbackQuery | undefined;

  // Ambil data dengan guard aman (tanpa bergantung pada sub-tipe internal)
  const data: string =
    cq && 'data' in (cq as any) ? ((cq as any).data as string) : '';

  if (data === 'list') {
    const sessions = listOpenSessions(50);
    if (!sessions.length) {
      await ctx.editMessageText('Tidak ada chat aktif.');
      return;
    }
    const rows = sessions.map((s) => [
      { text: `${s.visitor_name || '-'} — ${s.id}`, callback_data: `use:${s.id}` },
    ]);
    await ctx.editMessageText('List Chat Active (tap untuk reply):', {
      reply_markup: { inline_keyboard: rows },
    });
    return;
  }

  if (data.startsWith('use:')) {
    activeSessionId = data.split(':')[1];
    await ctx.answerCbQuery(`Active: ${activeSessionId}`);
    return;
  }

  if (data.startsWith('close:')) {
    const sid = data.split(':')[1];
    closeSession(sid);
    await ctx.editMessageText(`Chat ${sid} ditutup.`);
    return;
  }
});

/* ----------------- text handler ----------------- */
bot.on('text', async (ctx) => {
  const text = ctx.message.text?.trim();
  if (!text) return;
  if (!activeSessionId) return ctx.reply('No active session. /use <sessionId> dulu.');
  await routeAdminMessage(activeSessionId, text);
});

/* --------- admin kirim gambar → user --------- */
bot.on('photo', async (ctx) => {
  if (!activeSessionId) return ctx.reply('No active session. /use <sessionId> dulu.');
  try {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const dataUrl = await tgFileToDataUrl(largest.file_id, 'image/jpeg');

    addMessage(activeSessionId, 'admin', '[image]');
    ioEmit?.(activeSessionId, 'admin:message', { type: 'image', data: dataUrl, at: new Date().toISOString() });

    if (ctx.message.caption) await routeAdminMessage(activeSessionId, ctx.message.caption);
  } catch (err) {
    console.error('PHOTO handler error', err);
    await ctx.reply('Gagal kirim foto ke user.');
  }
});

bot.on('document', async (ctx) => {
  if (!activeSessionId) return ctx.reply('No active session. /use <sessionId> dulu.');
  const doc = ctx.message.document;
  const mime = doc.mime_type || '';
  if (!mime.startsWith('image/')) return ctx.reply('Dokumen ini bukan gambar. Kirim foto/gambar saja 👍');

  try {
    const dataUrl = await tgFileToDataUrl(doc.file_id, mime);
    addMessage(activeSessionId, 'admin', '[image]');
    ioEmit?.(activeSessionId, 'admin:message', { type: 'image', data: dataUrl, at: new Date().toISOString() });

    if (ctx.message.caption) await routeAdminMessage(activeSessionId, ctx.message.caption);
  } catch (err) {
    console.error('DOCUMENT image handler error', err);
    await ctx.reply('Gagal kirim gambar ke user.');
  }
});

/* --------- bridge ke Socket.IO (diisi dari server.ts) --------- */
let ioEmit: ((sessionId: string, event: string, payload: any) => void) | null = null;
export const bindEmitter = (fn: typeof ioEmit) => { ioEmit = fn; };
