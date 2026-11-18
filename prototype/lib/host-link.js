// Wallpaper · 公共宿主对接——主题页面的"托管模式"
// - 壁纸模式（?wallpaper=1）：桌面宿主 host/Wallpaper.exe 通过 WebView2 发消息
// - 预览模式（?preview=1）：设置窗口（settings.html）通过 iframe 的 postMessage 发消息
// 消息：icons（真实图标矩形，物理像素）/ settings（参数，部分更新）/ reset（恢复默认）/ pause（暂停动画）
// 场景层（scene-kit）通过 handle 回调拿到解析好的消息；这里只管收发和模式标记。
window.DKHost = (function () {
  'use strict';

  const QS = new URLSearchParams(location.search);
  const WALL = QS.has('wallpaper');
  const PREVIEW = QS.has('preview');

  function start(handlers) {
    if (!WALL && !PREVIEW) return null;               // 网页原型模式：不用托管
    document.body.classList.add('wall');
    if (PREVIEW) {
      document.body.classList.add('preview');
      const g = document.createElement('div'); g.id = 'ghosts'; document.body.appendChild(g);
    }
    let first = true;
    const handle = m => {
      if (m.t === 'pause') { handlers.onPause(PREVIEW ? false : !!m.v); return; }
      if (m.t === 'settings') { handlers.onSettings(m.v || {}); return; }
      if (m.t === 'reset') { handlers.onReset(m.v || {}); return; }
      if (m.t !== 'icons') return;
      const k = window.devicePixelRatio || 1;         // 物理像素 → CSS 像素
      const rects = m.vis ? m.r.map(([l, t, r, b]) => ({ x: l / k, y: t / k, w: (r - l) / k, h: (b - t) / k })) : [];
      handlers.onIcons(rects, first);                 // 第一次：地形/景物"长出来"；之后：平滑跟着图标走
      first = false;
    };
    if (PREVIEW) {
      addEventListener('message', ev => {
        if (ev.source !== parent) return;
        handle(typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data);
      });
      parent.postMessage(JSON.stringify({ t: 'ready' }), '*');
    } else {
      const host = window.chrome && window.chrome.webview;
      if (!host) return null;
      host.addEventListener('message', ev => handle(JSON.parse(ev.data)));
      host.postMessage('ready');
    }
    return { firstDone: () => !first };
  }

  // 预览模式：把图标位置画成半透明的示意方块（真实图标由设置窗口自己画）
  function drawGhosts(icons) {
    const box = document.getElementById('ghosts');
    if (!box) return;
    box.innerHTML = icons.map(ic =>
      `<div class="ghost" style="left:${ic.x}px;top:${ic.y}px;width:${ic.w}px;height:${ic.h}px"><i></i><b></b></div>`).join('');
  }

  return { WALL, PREVIEW, start, drawGhosts };
})();
