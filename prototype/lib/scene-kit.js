// Wallpaper · 主题页面骨架（Canvas2D 系主题共用）
// 画布与静态层缓存、主循环（30fps 限帧）、桌面图标（拖拽/布局）、原型面板、
// 托管模式（壁纸/预览的消息）、分享（share.js 需要的全局量）都由这里提供。
//
// 页面约定：主题页面在自己的 <script> 里先定义 window.THEME：
//   {
//     title: '沙滩 · 原型',                 // 面板标题
//     params: { sigma: 85, ... },           // 参数默认值（要和 themes.json 的 default 一致）
//     sliders: [{key,label,min,max,step,fmt}], toggles: [{key,label}],
//     fieldKeys: ['sigma','warp'],          // 改了要重算地形场的参数
//     isWater(x,y),                         // 图标落进"水里"时激起涟漪（可选）
//     init(DK),                             // 建主题自己的状态（融球场、鱼群、云……）
//     drawStatic(ctx, scale),               // 静态层：地形、景物；只在图标/参数/尺寸变化时重画
//     frame(now, dt, ctx, scale),           // 动态层：每帧画小物体（ctx 已按 scale 设好变换，用 CSS 像素画）
//     onParams(changed), iconsChanged(fromEmpty), resized(), seedChanged(),
//   }
// 页面按顺序加载：terrain.js → kit-2d.js → 主题脚本 → scene-kit.js → share.js
window.DK = (function () {
  'use strict';
  const T = window.DKT, K = window.DK2, Host = window.DKHost;
  const THEME = window.THEME;

  /* ---------- 常量 / 全局量（share.js 依赖：cv、draw、icons、W、H、WALL、TASKBAR、paused、frameN、commit、cacheOK） ---------- */
  window.CELL_W = 76; window.CELL_H = 100; window.GRID_X0 = 4; window.GRID_Y0 = 6;
  const TASKBAR = 48; window.TASKBAR = TASKBAR;
  const WALL = Host.WALL, PREVIEW = Host.PREVIEW;
  window.WALL = WALL; window.PREVIEW = PREVIEW;

  // 参数：主题的默认值 + 内部固定项（cap30：核显 30fps；quality 2：按屏幕的实际像素画）
  const P = Object.assign({ cap30: true, snap: true, debug: false, quality: 2 }, THEME.params);
  const DEFAULTS = Object.assign({}, P);
  window.P = P;

  const cv = document.getElementById('art');
  const ctx = cv.getContext('2d');
  window.cv = cv;
  const staticCv = document.createElement('canvas');
  const sctx = staticCv.getContext('2d');
  // cacheOK 用全局属性存：share.js 快照时会直接 cacheOK = false（同一个全局绑定）
  window.cacheOK = false;

  let W = innerWidth, H = innerHeight;
  window.W = W; window.H = H;

  /* ---------- 桌面图标 ---------- */
  const desktop = document.getElementById('desktop');
  window.icons = [];
  let iconsSeen = !(WALL || PREVIEW);
  let selected = null, drag = null, extraIdx = 0, layoutCapacity = 0, layoutKind = 'mine';
  const grid = { cols: 1, rows: 1 };
  let DW = innerWidth, DH = innerHeight - TASKBAR;
  window.ripples = [];
  function addRipple(x, y, str = 1) {
    window.ripples.push({ x, y, t0: performance.now(), str });
    if (window.ripples.length > 6) window.ripples.shift();
  }
  function computeGrid() {
    DW = innerWidth; DH = innerHeight - TASKBAR;
    grid.cols = Math.max(1, Math.floor((DW - window.GRID_X0) / window.CELL_W));
    grid.rows = Math.max(1, Math.floor((DH - window.GRID_Y0) / window.CELL_H));
  }
  const cellPos = (c, r) => ({ x: window.GRID_X0 + c * window.CELL_W, y: window.GRID_Y0 + r * window.CELL_H });
  const occupied = (x, y, self) => window.icons.some(ic => ic !== self && Math.abs(ic.x - x) < window.CELL_W / 2 && Math.abs(ic.y - y) < window.CELL_H / 2);
  function nearestFreeCell(cx, cy, self) {
    let best = null, bd = Infinity;
    for (let c = 0; c < grid.cols; c++) for (let r = 0; r < grid.rows; r++) {
      const pos = cellPos(c, r);
      if (occupied(pos.x, pos.y, self)) continue;
      const dd = Math.hypot(pos.x + window.CELL_W / 2 - cx, pos.y + window.CELL_H / 2 - cy);
      if (dd < bd) { bd = dd; best = pos; }
    }
    return best;
  }

  /* ---------- 图标外观（网页原型模式用；壁纸模式由 Windows 画真的） ---------- */
  const PAGE = '<path d="M12 4h17l9 9v29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fbfbfb" stroke="#c4c4c4"/><path d="M29 4v7a2 2 0 0 0 2 2h7z" fill="#dedede"/>';
  const LINES = '<path d="M24 20h10M24 25h10M24 30h10M24 35h10" stroke="#c9c9c9" stroke-width="1.6"/>';
  const badge = (color, text, size = 11) => `<rect x="4" y="21" width="19" height="19" rx="3" fill="${color}"/><text x="13.5" y="34.5" text-anchor="middle" font-family="Segoe UI,Arial" font-weight="700" font-size="${size}" fill="#fff">${text}</text>`;
  const SVG = {
    folder: '<path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v2H4z" fill="#e09b1d"/><path d="M4 17h40v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#ffc83d"/><path d="M4 17h40v2.5H4z" fill="#ffd978"/>',
    docx: PAGE + LINES + badge('#185abd', 'W'),
    xlsx: PAGE + '<path d="M24 19h11v17H24zM24 24.5h11M24 30h11M29.5 19v17" stroke="#9ac9a9" stroke-width="1.3" fill="none"/>' + badge('#107c41', 'X'),
    pdf: PAGE + LINES + badge('#d33a2c', 'PDF', 7.5),
    cad: PAGE + LINES + badge('#2a7fd4', 'DWG', 7),
    txt: PAGE + '<path d="M16 18h16M16 23h16M16 28h16M16 33h10" stroke="#9a9a9a" stroke-width="1.6"/>',
    png: PAGE + '<rect x="14" y="17" width="20" height="17" rx="1.5" fill="#8fd0f5"/><path d="M14 30l6-6 5 5 3-3 6 6v1.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 14 34z" fill="#3fa35a"/><circle cx="29" cy="21.5" r="2" fill="#fff4b8"/>',
    shot: '<rect x="3" y="13" width="42" height="25" rx="1" fill="#1d2129" stroke="#f2f2f2" stroke-width="1.5"/><rect x="6" y="16" width="14" height="3" fill="#5b8def"/><rect x="6" y="21" width="22" height="2" fill="#6c7280"/><rect x="6" y="25" width="18" height="2" fill="#2e3440"/>',
    zip: PAGE + '<path d="M22 4v4h3v3h-3v3h3v3h-3v3h3v3h-3" stroke="#8a6d3b" stroke-width="2" fill="none"/><rect x="20" y="26" width="7" height="8" rx="1" fill="#8a6d3b"/>',
    bin: '<path d="M12 14h24l-2.5 27a3 3 0 0 1-3 2.7H17.5a3 3 0 0 1-3-2.7z" fill="rgba(215,235,250,.55)" stroke="rgba(255,255,255,.9)" stroke-width="1.2"/><path d="M10 12.5h28" stroke="rgba(255,255,255,.95)" stroke-width="2.4" stroke-linecap="round"/><path d="M19 19l1 19M24 19v19M29 19l-1 19" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/>',
    pc: '<rect x="5" y="8" width="38" height="26" rx="2" fill="#1f8fe0" stroke="#bfe3ff" stroke-width="1.5"/><path d="M5 30h38" stroke="#0d5fa8" stroke-width="3"/><path d="M19 34l-2 6h14l-2-6z" fill="#9aa7b4"/>',
  };
  const APP_COLORS = ['#e8553e', '#2f7de1', '#18a058', '#8b5cf6', '#f59e0b', '#0ea5a4', '#db2777', '#334155', '#16a34a', '#2563eb'];
  function appSVG(name) {
    let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return `<rect x="5" y="5" width="38" height="38" rx="9" fill="${APP_COLORS[h % APP_COLORS.length]}"/><path d="M5 14a9 9 0 0 1 9-9h20a9 9 0 0 1 9 9v6H5z" fill="#fff" opacity=".14"/>` +
      `<text x="24" y="31.5" text-anchor="middle" font-family="Segoe UI,Microsoft YaHei,Arial" font-weight="700" font-size="18" fill="#fff">${[...name][0]}</text>`;
  }
  const glyphOf = (name, type) => type === 'app' ? appSVG(name) : SVG[type];

  const FILES = [
    ['回收站', 'bin'], ['项目资料', 'folder'], ['2026 报价单.xlsx', 'xlsx'], ['产品需求.docx', 'docx'],
    ['截图_0927.png', 'png'], ['合同扫描件.pdf', 'pdf'], ['新建文件夹', 'folder'], ['设计素材', 'folder'],
    ['旅行照片', 'folder'], ['安装包.zip', 'zip'], ['会议纪要.docx', 'docx'], ['壁纸灵感', 'folder'],
    ['周报.xlsx', 'xlsx'], ['草图.png', 'png'], ['旧备份', 'folder'], ['微信图片.png', 'png'], ['说明书.pdf', 'pdf'], ['简历.docx', 'docx'], ['支出表.xlsx', 'xlsx'], ['压缩备份.zip', 'zip'], ['素材图.png', 'png'], ['下载', 'folder'], ['表情包.png', 'png'], ['工资条.xlsx', 'xlsx'], ['租房合同.pdf', 'pdf'], ['日记.docx', 'docx'], ['桌面截图.png', 'png'],
  ];
  const EXTRA = [
    ['新建文本文档.txt', 'txt'], ['新建文件夹 (2)', 'folder'], ['发票.pdf', 'pdf'], ['数据导出.xlsx', 'xlsx'],
    ['截图_0928.png', 'png'], ['备忘.txt', 'txt'], ['归档.zip', 'zip'], ['新建文件夹 (3)', 'folder'],
  ];
  const APPS = ['回收站', '此电脑', '微信', '飞书', '钉钉', '腾讯会议', '网易云音乐', '剪映', 'Photoshop', 'Obsidian', 'VS Code', 'Krita',
    'AutoCAD', 'Rhino', 'KeyShot', '百度网盘', 'Chrome', 'Blender', 'Figma', 'Notion', 'QQ', 'Steam', 'Eagle', 'OBS', 'Kimi', 'PureRef', 'EV录屏', 'NX 12.0', 'MarkText', 'Codex'];
  const MISC = [['projects', 'folder'], ['游戏', 'folder'], ['todolist', 'folder'], ['OKR管理.xlsx', 'xlsx'], ['固定成本.xlsx', 'xlsx'],
    ['pdfarrange', 'app'], ['stp.log', 'txt'], ['零件.stp', 'txt'], ['零件.3dm', 'png'], ['预览', 'folder']];
  const RIGHT = [['plot.log', 'txt'], ['工具', 'folder'], ['归档.rar', 'zip'], ['1685x128.png', 'png'], ['微信图片.jpg', 'png'], ['0914.png', 'png'],
    ['微信图片 2.jpg', 'png'], ['images.png', 'png'], ['目录.docx', 'docx'], ['api.txt', 'txt'], ['c4ef.png', 'png'], ['0918.png', 'png'],
    ['板调整.pdf', 'pdf'], ['recommend.txt', 'txt'], ['button.stp', 'txt'], ['新建文本 (2).txt', 'txt'], ['ugstep21', 'txt'], ['新建文本 (3).txt', 'txt'],
    ['工作计划.txt', 'txt'], ['微信图片 3.jpg', 'png'], ['新建 DOCX.docx', 'docx'], ['SEO.txt', 'txt'], ['resend.txt', 'txt'], ['产品介绍.txt', 'txt'],
    ['USER.pdf', 'pdf'], ['新建文本.txt', 'txt'], ['餐椅.pur', 'png'], ['PAP-20.pdf', 'pdf'], ['演示文稿.pptx', 'pdf'], ['问题点.txt', 'txt']];
  function mineCells() {
    const out = []; let a = 0, m = 0, rgt = 0, sh = 0;
    for (let c = 0; c < 3; c++) for (let r = 0; r < 10; r++) {
      const name = APPS[a++];
      out.push([c, r, name, name === '回收站' ? 'bin' : name === '此电脑' ? 'pc' : 'app']);
    }
    for (let r = 0; r < 10; r++) out.push([3, r, ...MISC[m++]]);
    for (let r = 0; r < 5; r++) out.push([5, r, `零件结构 ${r + 1}.dwg`, 'cad']);
    out.push([6, 0, '腿测试.bak', 'txt']);
    for (const [c, r] of [[6, 4], [6, 5], [6, 6], [6, 7], [6, 8], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [8, 4], [8, 5], [8, 6], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6]])
      out.push([c, r, `ScreenShot ${++sh}.png`, 'shot']);
    for (const [c, r] of [[11, 1], [11, 2], [11, 3], [12, 1], [12, 2], [12, 3], [12, 4], [13, 1], [13, 2], [13, 3], [13, 4], [14, 1], [14, 3], [14, 4], [15, 1], [15, 6],
      [16, 4], [16, 6], [17, 4], [17, 5], [17, 6], [17, 7], [19, 4], [19, 5], [19, 8], [20, 0], [20, 4], [20, 6], [21, 0], [21, 5], [21, 6]]) {
      const f = RIGHT[rgt++ % RIGHT.length]; out.push([c, r, f[0], f[1]]);
    }
    return out;
  }
  const mulberry32 = K.mulberry32;

  function addIcon([name, type], pos, born = false) {
    const el = document.createElement('div');
    el.className = 'icon' + (born ? ' born' : '');
    el.innerHTML = `<div class="glyph"><svg viewBox="0 0 48 48">${glyphOf(name, type)}</svg></div><div class="label">${name}</div>`;
    el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
    desktop.appendChild(el);
    const ic = { name, type, x: pos.x, y: pos.y, w: el.offsetWidth, h: el.offsetHeight, el };
    window.icons.push(ic); bindDrag(ic);
    return ic;
  }
  function setPos(ic, x, y) { ic.x = x; ic.y = y; ic.el.style.left = x + 'px'; ic.el.style.top = y + 'px'; }
  function select(ic) {
    if (selected) selected.el.classList.remove('sel');
    selected = ic;
    if (ic) ic.el.classList.add('sel');
  }
  function bindDrag(ic) {
    const el = ic.el;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); select(ic);
      el.setPointerCapture(e.pointerId); el.classList.remove('settle');
      drag = { ic, sx: e.clientX, sy: e.clientY, ox: ic.x, oy: ic.y, moved: false };
    });
    el.addEventListener('pointermove', e => {
      if (!drag || drag.ic !== ic) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true; el.classList.add('drag');
      el.style.left = drag.ox + dx + 'px'; el.style.top = drag.oy + dy + 'px';
    });
    const end = (e, cancel) => {
      if (!drag || drag.ic !== ic) return;
      const d = drag; drag = null;
      el.classList.remove('drag');
      if (!d.moved) return;
      let nx = cancel ? d.ox : d.ox + (e.clientX - d.sx), ny = cancel ? d.oy : d.oy + (e.clientY - d.sy);
      nx = Math.min(Math.max(nx, 0), DW - ic.w); ny = Math.min(Math.max(ny, 0), DH - ic.h);
      if (P.snap && !cancel) { const c = nearestFreeCell(nx + ic.w / 2, ny + ic.h / 2, ic); if (c) { nx = c.x; ny = c.y; } }
      if (Math.hypot(nx - d.ox, ny - d.oy) < 0.5) { setPos(ic, nx, ny); return; }
      const cx = nx + ic.w / 2, cy = ny + ic.h / 2;
      if (THEME.isWater && THEME.isWater(cx, cy)) addRipple(cx, cy, 1.3);
      el.classList.add('settle'); setPos(ic, nx, ny);
      commit();
    };
    el.addEventListener('pointerup', e => end(e, false));
    el.addEventListener('pointercancel', e => end(e, true));
  }

  function applyLayout(kind) {
    layoutKind = kind;
    window.icons.forEach(ic => ic.el.remove()); window.icons = []; selected = null; extraIdx = 0;
    computeGrid();
    layoutCapacity = grid.cols * grid.rows;
    if (kind === 'mine') {
      for (const [c, r, name, type] of mineCells()) {
        const pos = cellPos(Math.round(c * (grid.cols - 1) / 21), Math.round(r * (grid.rows - 1) / 9));
        if (!occupied(pos.x, pos.y, null)) addIcon([name, type], pos);
      }
    } else if (kind === 'arranged') {
      FILES.forEach((f, i) => { const c = Math.floor(i / grid.rows), r = i % grid.rows; if (c < grid.cols) addIcon(f, cellPos(c, r)); });
    } else if (kind === 'messy') {
      const rnd = mulberry32(20260928);
      for (const f of FILES) for (let t = 0; t < 300; t++) {
        const c = rnd() < 0.45 ? Math.floor(rnd() * Math.min(3, grid.cols)) : Math.floor(rnd() * grid.cols);
        const pos = cellPos(c, Math.floor(rnd() * grid.rows));
        if (!occupied(pos.x, pos.y, null)) { addIcon(f, pos); break; }
      }
    } else {
      Array.from({ length: 10 }, (_, r) => [[0, r], [1, r]]).flat().concat([[2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [3, 2], [Math.floor(grid.cols * 0.45), Math.floor(grid.rows * 0.5)]])
        .forEach(([c, r], i) => addIcon(FILES[i], cellPos(Math.min(c, grid.cols - 1), Math.min(r, grid.rows - 1))));
    }
    commit(true);
  }

  /* ---------- 地形场的提交（主题在 init 里建 DK.morph 就自动接上） ---------- */
  const iconRects = () => window.icons.map(ic => ({ cx: ic.x + ic.w / 2, cy: ic.y + ic.h / 2, hw: ic.w / 2 - 4, hh: ic.h / 2 - 2 }));
  function commit(fromEmpty = false) {
    if (DK.morph) DK.morph.commit(fromEmpty);
    window.cacheOK = false;
    if (THEME.iconsChanged) THEME.iconsChanged(fromEmpty);
  }
  window.commit = commit;                      // share.js 的演示录制直接调全局 commit
  function reseed(v) {
    T.setSeed(v);
    if (!iconsSeen) return;
    if (DK.morph) DK.morph.commit(true);
    window.cacheOK = false;
    if (THEME.seedChanged) THEME.seedChanged();
  }

  /* ---------- 尺寸 / 静态层 ---------- */
  let themeReady = false;                      // resize() 比 init() 先跑，主题钩子在 init 之前不触发
  function resize() {
    W = innerWidth; H = innerHeight;
    window.W = W; window.H = H;
    // 预览模式：页面按整块桌面的尺寸排版、再整体缩小显示，所以画布只需要很低的分辨率
    const scale = PREVIEW ? 0.45 : Math.min(devicePixelRatio || 1, P.quality);
    // 按画布实际占的大小算（带小数）：画布比屏幕多出一个像素时，浏览器会把整幅画缩放一下贴上去，又发糊
    const box = cv.getBoundingClientRect();
    cv.width = Math.round((box.width || W) * scale); cv.height = Math.round((box.height || H) * scale); cv._scale = scale;
    T.setSize(W, H);
    window.cacheOK = false;
    if (themeReady && THEME.resized) THEME.resized();
  }
  function renderStatic() {
    if (staticCv.width !== cv.width || staticCv.height !== cv.height) { staticCv.width = cv.width; staticCv.height = cv.height; }
    const s = cv._scale;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, staticCv.width, staticCv.height);
    sctx.setTransform(s, 0, 0, s, 0, 0);
    THEME.drawStatic(sctx, s);
    window.cacheOK = true;
  }

  /* ---------- 主循环 ---------- */
  const T0 = performance.now();
  let lastT = 0, fpsEMA = 0, frameMs = 0, lastDt = 0.03;
  window.frameN = 0;
  window.paused = false;                       // 宿主通知：前台窗口最大化 / 全屏 → 暂停
  window.draw = function draw(now, dt) {
    const measure = window.frameN % 20 === 0, t0 = performance.now();
    if (!window.cacheOK) renderStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(staticCv, 0, 0);             // 静态层整幅贴上（缓存命中时这是一次纯位块搬运）
    const s = cv._scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    THEME.frame(now, dt === undefined ? lastDt : dt, ctx, s);
    if (measure) frameMs = performance.now() - t0;
  };
  function frame(now) {
    requestAnimationFrame(frame);
    if (window.paused) { lastT = 0; return; }
    if (P.cap30 && now - lastT < 31) return;
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0.03;
    if (lastT) fpsEMA = fpsEMA ? fpsEMA * 0.9 + (1 / dt) * 0.1 : 1 / dt;
    lastT = now; lastDt = dt;
    if (DK.morph) DK.morph.tick(now);
    window.draw(now, dt);
    if (++window.frameN % 10 === 0) updateStats();
  }

  /* ---------- 面板（网页原型模式的调试面板） ---------- */
  const APP_SVGS = [
    '<rect x="2" y="2" width="9.5" height="9.5" fill="#4cc2ff"/><rect x="12.5" y="2" width="9.5" height="9.5" fill="#4cc2ff"/><rect x="2" y="12.5" width="9.5" height="9.5" fill="#4cc2ff"/><rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#4cc2ff"/>',
    '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M15 15l5 5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
    '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v1H2z" fill="#e09b1d"/><path d="M2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="#ffc83d"/>',
    '<circle cx="12" cy="12" r="10" fill="#1b8fd6"/><path d="M6 13c1-5 11-6 12 0-3-2-8-2-9 2 0 2 2 3 4 3-4 1-7-1-7-5z" fill="#6fe37a" opacity=".9"/>',
    '<rect x="2" y="4" width="20" height="16" rx="2.5" fill="#2b2b2b" stroke="#777"/><path d="M6 9l3 3-3 3M11 15h6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  ];
  function buildTaskbar() {
    const tb = document.createElement('div'); tb.id = 'taskbar';
    tb.innerHTML = `<div class="apps">${APP_SVGS.map(s => `<div class="app"><svg viewBox="0 0 24 24">${s}</svg></div>`).join('')}</div><div id="clock"></div>`;
    document.body.appendChild(tb);
    const tick = () => {
      const d = new Date(), z = n => String(n).padStart(2, '0');
      document.getElementById('clock').innerHTML = `${z(d.getHours())}:${z(d.getMinutes())}<br>${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    };
    setInterval(tick, 15000); tick();
  }
  function buildPanel() {
    const panel = document.createElement('aside'); panel.id = 'panel';
    let html = `<header><div><b>Wallpaper</b><span>${THEME.title || '原型'}</span></div>
      <div><button class="ibtn" id="collapse" title="折叠">–</button></div></header><div class="body">
      <div class="sec"><div class="t">桌面布局</div><div class="seg" id="layoutSeg">
      <button data-v="mine">仿你的桌面</button><button data-v="arranged">自动排列</button><button data-v="messy">杂乱</button><button data-v="minimal">极简</button>
      </div></div><div class="sec" id="sliders"></div><div class="sec toggles" id="toggles"></div>
      <div class="sec btns"><button id="btnAdd">＋ 新建文件</button><button id="btnSeed">换一张</button></div>
      <div id="stats"></div></div>`;
    panel.innerHTML = html;
    document.body.appendChild(panel);
    const slidersEl = panel.querySelector('#sliders');
    for (const s of THEME.sliders || []) {
      const wrap = document.createElement('div');
      wrap.className = 'slider';
      wrap.innerHTML = `<div class="row"><span>${s.label}</span><span></span></div><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${P[s.key]}">`;
      const out = wrap.querySelector('.row span:last-child'), inp = wrap.querySelector('input');
      out.textContent = s.fmt ? s.fmt(P[s.key]) : P[s.key];
      inp.addEventListener('input', () => {
        P[s.key] = +inp.value; out.textContent = s.fmt ? s.fmt(P[s.key]) : P[s.key];
        if ((THEME.fieldKeys || []).includes(s.key) && DK.morph && DK.morph.FB) DK.morph.refresh();
        window.cacheOK = false;
        if (THEME.onParams) THEME.onParams([s.key]);
      });
      slidersEl.appendChild(wrap);
    }
    const togglesEl = panel.querySelector('#toggles');
    for (const t of [{ key: 'snap', label: '对齐网格' }, { key: 'cap30', label: '限帧 30fps' }].concat(THEME.toggles || [])) {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" data-key="${t.key}" ${P[t.key] ? 'checked' : ''}>${t.label}`;
      label.querySelector('input').addEventListener('change', e => {
        P[t.key] = e.target.checked;
        window.cacheOK = false;
        if (THEME.onParams) THEME.onParams([t.key]);
      });
      togglesEl.appendChild(label);
    }
    panel.querySelector('#layoutSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      applyLayout(b.dataset.v); syncPanel();
    });
    panel.querySelector('#collapse').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      panel.querySelector('#collapse').textContent = panel.classList.contains('collapsed') ? '+' : '–';
    });
    panel.querySelector('#btnSeed').addEventListener('click', () => reseed(T.nextSeed()));
    panel.querySelector('#btnAdd').addEventListener('click', () => {
      const f = EXTRA[extraIdx++ % EXTRA.length];
      let pos = null;
      for (let t = 0; t < 300 && !pos; t++) {
        const c = cellPos(Math.floor(Math.random() * grid.cols), Math.floor(Math.random() * grid.rows));
        if (!occupied(c.x, c.y, null)) pos = c;
      }
      if (!pos) return;
      const ic = addIcon(f, pos, true);
      select(ic);
      if (THEME.isWater && THEME.isWater(pos.x + ic.w / 2, pos.y + ic.h / 2)) addRipple(pos.x + ic.w / 2, pos.y + ic.h / 2, 1.3);
      commit();
    });
    // 默认收着：面板只是调试用
    panel.classList.add('hidden');
    addEventListener('keydown', e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        const ic = selected; select(null); ic.el.remove(); window.icons = window.icons.filter(x => x !== ic); commit();
      } else if (e.key === 'h' || e.key === 'H') panel.classList.toggle('hidden');
    });
  }
  function syncPanel() {
    document.querySelectorAll('#layoutSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === layoutKind));
    document.querySelectorAll('#toggles input').forEach(inp => { inp.checked = P[inp.dataset.key]; });
  }
  const statsEl = () => document.getElementById('stats');
  function updateStats() {
    const el = statsEl(); if (!el || window.wall) return;
    el.innerHTML =
      `<span class="live">● 动画中 · ${fpsEMA.toFixed(0)} fps</span><br>` +
      `单帧 ${frameMs.toFixed(1)} ms · 陆地场 ${T.fieldMs.toFixed(0)} ms<br>` +
      `画布 ${cv.width}×${cv.height} · 图标 ${window.icons.length} · 静态层${window.cacheOK ? '命中' : '重画'}`;
  }

  desktop.addEventListener('pointerdown', e => {
    select(null);
    if (THEME.isWater && THEME.isWater(e.clientX, e.clientY)) addRipple(e.clientX, e.clientY);
  });

  let resizeT = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (WALL || PREVIEW) { resize(); if (DK.morph) DK.morph.refresh(); return; }
      resize(); computeGrid();
      if (grid.cols * grid.rows > layoutCapacity && layoutCapacity < 40) { applyLayout(layoutKind); syncPanel(); return; }
      for (const ic of window.icons) setPos(ic, Math.min(ic.x, Math.max(0, DW - ic.w)), Math.min(ic.y, Math.max(0, DH - ic.h)));
      if (DK.morph) DK.morph.refresh();
    }, 100);
  });

  /* ---------- 托管模式 ---------- */
  // 应用设置：只处理认识的参数（设置文件里多出来的旧键不生效）；seed = 设置窗口的"换一张"
  function applySettings(v) {
    if (typeof v.seed === 'number' && v.seed !== T.getSeed()) reseed(v.seed);
    const changed = [];
    for (const k in v) {
      if (!(k in P) || typeof v[k] !== typeof P[k] || P[k] === v[k]) continue;
      P[k] = v[k]; changed.push(k);
    }
    if (!changed.length) return;
    if (changed.some(k => (THEME.fieldKeys || []).includes(k)) && DK.morph && DK.morph.FB) DK.morph.refresh();
    window.cacheOK = false;
    if (THEME.onParams) THEME.onParams(changed);
  }
  // 暂停时来的图标消息：把首次地形和布局画完再冻结（和 flat.html 的 settlePaused 一致）
  function settlePaused() {
    if (!window.paused || !iconsSeen) return;
    if (DK.morph) { DK.morph.curMix = 1; DK.morph._t0 = -1e9; }
    window.draw(performance.now());
  }
  function startHosted() {
    window.icons = [];
    commit(true);                                // 先是一片空场景（还不知道图标在哪）
    Host.start({
      onIcons(rects, first) {
        window.icons = rects;
        if (PREVIEW) Host.drawGhosts(window.icons);
        iconsSeen = true;
        commit(first);
        settlePaused();
      },
      onSettings(v) { applySettings(v); },
      onReset(v) { applySettings(Object.assign({}, DEFAULTS, v)); },
      onPause(v) { window.paused = v; settlePaused(); },
    });
  }

  /* ---------- 启动 ---------- */
  const DK = {
    P, cv, ctx, TASKBAR, WALL, PREVIEW,
    get W() { return W; }, get H() { return H; },
    get icons() { return window.icons; },
    get iconsSeen() { return iconsSeen; },
    addRipple, commit, reseed, applyLayout, invalidate: () => { window.cacheOK = false; },
    get ripples() { return window.ripples; },     // 涟漪由场景层自己画（图标落水、点击水面）
    morph: null,                                  // 主题在 init 里赋 DK.morph = DKT.createMorph(...)
  };
  buildTaskbar();
  buildPanel();
  resize();
  if (THEME.init) THEME.init(DK);
  themeReady = true;
  window.__dbg = {
    P, DK,
    bench() {
      const ts = [];
      for (let i = 0; i < 10; i++) { const a = performance.now(); window.draw(performance.now()); ts.push(performance.now() - a); }
      ts.sort((a, b) => a - b);
      return { frame: +ts[5].toFixed(1), canvas: cv.width + 'x' + cv.height };
    },
  };
  if (WALL || PREVIEW) startHosted();
  else { applyLayout('mine'); syncPanel(); }
  requestAnimationFrame(frame);
  return DK;
})();
