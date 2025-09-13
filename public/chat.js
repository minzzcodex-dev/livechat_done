/* ========== 1) Fullscreen chat (HANYA di chat.html / chat.php) ========== */
(function () {
  const HOST = (document.currentScript && new URL(document.currentScript.src).origin) || location.origin;

  // ⛔ Jalankan hanya di halaman chat.html / chat.php
  const path = location.pathname.toLowerCase();
  if (!(path.endsWith('/public/chat.html') || path.endsWith('/public/chat.php'))) return;

  const $  = (s) => document.querySelector(s);
  const el = (t,c,h)=>{const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e;};
  const store=(k,v)=> v===undefined? localStorage.getItem(k) : localStorage.setItem(k,v);

  const ioScript = document.createElement('script');
  ioScript.src = HOST + '/socket.io/socket.io.js';
  ioScript.onload = init;
  document.head.appendChild(ioScript);

  function init(){
    const socket = window.io(HOST, { transports:['websocket','polling'] });

    // DOM refs
    const pre     = $('#prechat');
    const chat    = $('#mcx-chat');
    const list    = $('#mcx-msgs');
    const field   = $('#mcx-input');
    const btnSend = $('#btn-send');
    const btnAttach = $('#btn-attach');
    const picker  = $('#mcx-picker');
    const btnEmoji = $('#btn-emoji');
    const emojiPanel = $('#mcx-emoji');
    const emojiGrid  = $('#mcx-emoji-grid');

    // state
    const SID_KEY='lc_session_id';
    let sessionId = store(SID_KEY);
    let preName='', preTopic='';
    let lastSentImageSig = null;

    const api = async (path, opts)=> (await fetch(HOST+path,{headers:{'Content-Type':'application/json'},...opts})).json();
    async function ensureSession(name){
      if (sessionId) return sessionId;
      const r = await api('/api/session',{method:'POST', body: JSON.stringify({ name })});
      sessionId = r.sessionId; store(SID_KEY, sessionId); return sessionId;
    }

    function openChatUI(){
      if (pre) pre.style.display='none';
      if (chat) chat.classList.add('open');
    }

    // builder
    function pushMsg(role, content, isImage=false){
      const row = el('div','msg '+role);
      // ✅ perbaikan domain avatar:
      const pp  = el('div','pp','<img src="https://i.ibb.co/jkVLzKJ9/cewe-img.jpg" alt="pp">');
      const bubble = el('div','bubble');

      if (isImage){
        const img = new Image(); img.src = content; img.alt='image'; bubble.appendChild(img);
      } else {
        bubble.textContent = content;
      }
      if (role !== 'visitor') row.appendChild(pp);
      row.appendChild(bubble);
      list.appendChild(row);
      list.scrollTop = list.scrollHeight;
    }
    function dataUrlSig(d){
      try { const b=d.split(',')[1]||''; return b.slice(0,48)+'_'+b.length; } catch { return String(d).length; }
    }

    // expose untuk prechat start
window.MCX_START_CHAT = async ({name, topic})=>{
  preName = name;
  preTopic = topic;
  openChatUI();
  await ensureSession(preName);
  socket.emit('visitor:init', { sessionId });

  // ✅ Jangan tampilkan detail ke user, cukup kirim ke Telegram
  socket.emit('visitor:message', {
    sessionId,
    text: `[Prechat]\nusername: ${preName}\nPertanyaan: ${preTopic}`
  });

  // ✅ Tampilkan sapaan ramah ke user
  pushMsg('admin', 'Hallo Bosku, ada yang bisa kami bantu?');
};

    // send text
    async function sendText(){
      const t=(field.value||'').trim(); if(!t) return; field.value='';
      pushMsg('visitor', t);
      await ensureSession(preName);
      socket.emit('visitor:message', { sessionId, text:t });
    }
    btnSend?.addEventListener('click', sendText);
    field?.addEventListener('keydown', e=>{ if(e.key==='Enter') sendText(); });

    // emoji
    const EMOJIS = '😀 😃 😄 😁 😆 🥹 😉 😊 🙂 😍 🤩 😘 😜 😎 😭 😡 👍 🙏 🎉 ❤️ 🔥 💯 🤝 👋 🤗 🤔 😇 😴 🤤 🤪 🤯 🤓 😷 🤒 🤕 🤧 🤑 📸 ✨ ✅ ❌ ⏳'.split(/\s+/);
    EMOJIS.forEach(ch=>{
      const b=el('button','',ch);
      b.onclick=()=>{ insertAtCursor(field,ch); if (emojiPanel) emojiPanel.style.display='none'; };
      emojiGrid?.appendChild(b);
    });
    btnEmoji?.addEventListener('click', ()=>{
      if (!emojiPanel) return;
      emojiPanel.style.display = (emojiPanel.style.display==='block'?'none':'block');
    });
    function insertAtCursor(inp,txt){ if(!inp) return; const s=inp.selectionStart||inp.value.length, e=inp.selectionEnd||s; inp.value=inp.value.slice(0,s)+txt+inp.value.slice(e); inp.focus(); inp.selectionStart=inp.selectionEnd=s+txt.length; }

    // attach image
    btnAttach?.addEventListener('click', ()=> picker?.click());
    picker?.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0]; if(!f) return;
      if (f.size > 8*1024*1024) { alert('Maksimal 8MB'); e.target.value=''; return; }
      const r=new FileReader();
      r.onload = async ()=>{
        const dataUrl=String(r.result||'');
        lastSentImageSig = dataUrlSig(dataUrl);
        pushMsg('visitor', dataUrl, true);
        await ensureSession(preName);
        socket.emit('visitor:image', { sessionId, data:dataUrl });
      };
      r.readAsDataURL(f); e.target.value='';
    });

    // incoming dari admin
    socket.on('admin:message', (p)=>{
      if (p?.type === 'image' && p.data){
        const sig=dataUrlSig(p.data);
        if (sig && sig === lastSentImageSig) return; // ignore echo
        pushMsg('admin', p.data, true);
      } else if (p?.text){
        pushMsg('admin', p.text);
      }
    });
  }
})();
/* ========== 2) Launcher bubble → Modal iframe 70% (di halaman non-chat) ========== */
(function () {
  const HOST = (document.currentScript && new URL(document.currentScript.src).origin) || location.origin;

  // kalau sedang di chat.html/php, jangan bikin modal
  const path = location.pathname.toLowerCase();
  if (path.endsWith('/public/chat.html') || path.endsWith('/public/chat.php')) return;

  // helper
  const el = (t, cls, html) => {
    const e = document.createElement(t);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  // === MODE LAUNCHER + MODAL ===
const launcher = el('div', 'lc-launcher', '<i><span></span><span></span><span></span></i>');
  const badge = el('div', 'lc-badge', '');
  badge.style.display = 'none';
  launcher.appendChild(badge);
  document.body.appendChild(launcher);

  const overlay = el('div', 'lc-overlay');
  const wrap = el('div', 'lc-frame-wrap');
  const closeBtn = el('button', 'lc-frame-close', '&times;');
  const iframe = el('iframe', 'lc-frame');
  iframe.src = HOST + '/public/chat.html?embed=1';


  wrap.append(closeBtn, iframe);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  launcher.addEventListener('click', () => {
    badge.style.display = 'none';
    badge.textContent = '';
    overlay.classList.add('open');
  });

  closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

  // notifikasi (opsional)
  window.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'object' || !ev.data) return;
    if (ev.data.type === 'mcx:notify' && !overlay.classList.contains('open')) {
      badge.style.display = 'block';
      badge.textContent = '1';
    }
  }, false);
})();
