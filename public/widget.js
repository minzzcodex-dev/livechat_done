(function (w, d) {
  function initChat() {
    if (d.getElementById("mcx-livechat")) return;

    // ===== IFRAME CHAT (fullscreen modal) =====
    var iframe = d.createElement("iframe");
    iframe.id = "mcx-livechat";
    iframe.src = "https://livechat.cakwe77.icu/public/chat.html?embed=1";
    iframe.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      border:none;z-index:999998;
      background:#0f1115;
      display:none;opacity:0;
      transition:opacity .3s ease;
    `;
    d.body.appendChild(iframe);

    // ===== CLOSE BUTTON (di atas kanan) =====
    var closeBtn = d.createElement("div");
    closeBtn.id = "mcx-livechat-close";
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="26" height="26" stroke="white" fill="none" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;
    closeBtn.style.cssText = `
      position:fixed;top:16px;right:16px;
      width:40px;height:40px;border-radius:50%;
      background:rgba(0,0,0,.6);display:none;
      align-items:center;justify-content:center;
      z-index:999999;cursor:pointer;
    `;
    d.body.appendChild(closeBtn);

    // ===== FLOATING BUTTON (trigger open) =====
    var btn = d.createElement("div");
    btn.id = "mcx-livechat-btn";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
        <path d="M2 12a10 10 0 1 1 5.93 9.14L2 22l1.86-4.27A9.96 9.96 0 0 1 2 12z"/>
      </svg>`;
    btn.style.cssText = `
      position:fixed;bottom:20px;right:20px;
      width:60px;height:60px;border-radius:50%;
      background:#ffd024;color:#111;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;z-index:100000;
      box-shadow:0 4px 12px rgba(0,0,0,.25);
      transition:transform .25s ease;
    `;
    btn.onmouseenter = () => (btn.style.transform = "scale(1.08)");
    btn.onmouseleave = () => (btn.style.transform = "scale(1)");
    d.body.appendChild(btn);

    // ===== EVENT: buka widget fullscreen =====
    btn.onclick = function () {
      iframe.style.display = "block";
      closeBtn.style.display = "flex";
      requestAnimationFrame(() => (iframe.style.opacity = "1"));
    };

    // ===== EVENT: minimize widget =====
    closeBtn.onclick = function () {
      iframe.style.opacity = "0";
      setTimeout(() => {
        iframe.style.display = "none";
        closeBtn.style.display = "none";
      }, 300);
    };

    // ✅ Fix input zoom iOS
    iframe.addEventListener("load", () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc) {
          const style = doc.createElement("style");
          style.innerHTML = `
            input,textarea,select { font-size:16px !important; }
            body { -webkit-text-size-adjust: 100%; }
          `;
          doc.head.appendChild(style);
        }
      } catch (e) {
        console.warn("inject style fail:", e);
      }
    });
  }

  if (d.readyState === "complete") initChat();
  else w.addEventListener("load", initChat);
})(window, document);
