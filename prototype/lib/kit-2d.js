// Wallpaper · 公共 2D 绘制原语——多个主题共用的"小景物"
// - 云：图标周围的一团云（融球场 + 三层圆）和天上整朵飘的云（从 meadow.html 移植）
// - 鱼群/小鸟：带避让的 boids 群体（珊瑚礁鱼群、锦鲤、林间小鸟共用）
// - 其他：圆角矩形路径、缓动、可复位的随机数
// 只做通用部分；主题自己的画风（笔触、配色、角色外形）留在各自的页面里。
window.DK2 = (function () {
  'use strict';
  const T = window.DKT;

  /* ---------- 小工具 ---------- */
  const sstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); addRoundRect(ctx, x, y, w, h, r); }
  function addRoundRect(ctx, x, y, w, h, r) {               // 不另起路径：几块拼成一个形状时用
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const turnToward = (h, target, rate) => { let d = target - h; d = Math.atan2(Math.sin(d), Math.cos(d)); return h + Math.sign(d) * Math.min(Math.abs(d), rate); };

  /* ============================================================
     图标周围的云团：融球场 + 三层圆（大 / 小 / 很小）
     圆的基础大小只看圆心在云团里多深，图标不动就不变；每 0.5 秒或场在过渡时重算。
     update 返回 [x, y, r, ph, ...]（已经带上呼吸和翻动）。
     opts: { morph, getEdge, R }  R：融球参考半径（云的厚度）
     ============================================================ */
  function createCloudMass(opts) {
    const { morph, getEdge, R = 95 } = opts;
    let cache = null, cacheT = -1e9, CW = 0, CH = 0;
    const rnd1 = (x, y, k) => T.hash2(x, y, k);
    function build(W, H) {
      const list = [], big = new Map();
      const layer = (G, k0, size, band, isBig) => {
        for (let cy = -Math.ceil(2 * R / G); cy <= Math.ceil((H + 2 * R) / G); cy++)
          for (let cx = -Math.ceil(2 * R / G); cx <= Math.ceil((W + 2 * R) / G); cx++) {
            const ox = rnd1(cx, cy, k0), oy = rnd1(cx, cy, k0 + 1), rr = rnd1(cx, cy, k0 + 2), ph = rnd1(cx, cy, k0 + 3);
            const x = (cx + 0.1 + ox * 0.8) * G, y = (cy + 0.1 + oy * 0.8) * G;
            const ci = morph.sample(x, y) - getEdge();       // 圆心处离云团边多远（<0 在云团里）
            if (ci > 0 || ci < band[1] - 10) continue;
            let r = G * (size[0] + (size[1] - size[0]) * rr) * band[2](ci);
            // 要和云团连在一起：碰得到主体，或（小圆）和某个大圆叠住一截
            const gap = ci + 0.6 * R;
            let att = sstep(gap - 4, gap + 12, r);
            if (!isBig) {
              const bx = Math.floor(x / R), by = Math.floor(y / R);
              for (let j = by - 1; j <= by + 1; j++) for (let i = bx - 1; i <= bx + 1; i++) {
                const o = big.get(i + ',' + j);
                if (!o) continue;
                const ov = o[2] + r - Math.hypot(o[0] - x, o[1] - y);
                att = Math.max(att, sstep(0.2 * r, 0.6 * r, ov));
              }
            }
            r *= att;
            r *= sstep(5, 11, r);                            // 太小的圆慢慢缩没，不留小点
            if (r < 0.5) continue;
            if (isBig) big.set(cx + ',' + cy, [x, y, r]);
            list.push(x, y, r, ph);
          }
      };
      // 大圆：圆心在云团里，越靠云边越小；小圆、很小的圆只长在靠边的一圈
      layer(R, 1, [0.55, 0.9], [0, -1e9, ci => sstep(-0.15 * R, -0.8 * R, ci)], true);
      layer(34, 11, [0.5, 0.9], [0, -1.0 * R, ci => sstep(-0.05 * R, -0.3 * R, ci) * (1 - sstep(-0.7 * R, -1.0 * R, ci))], false);
      layer(24, 21, [0.45, 0.8], [0, -0.6 * R, ci => sstep(0, -0.15 * R, ci) * (1 - sstep(-0.4 * R, -0.6 * R, ci))], false);
      return list;
    }
    // 云里的圆在动：绕原位慢慢转一个小圈（相邻的圆大致同向 → 整团在轻轻翻动）
    const wobX = (x, y, r, ph, ft) => (4.5 + 0.12 * r) * (0.85 * Math.sin(ft * 0.24 + x * 0.011 + y * 0.004) + 0.3 * Math.sin(ft * 0.3 + ph * 6.283));
    const wobY = (x, y, r, ph, ft) => (4.5 + 0.12 * r) * (0.65 * Math.sin(ft * 0.2 + y * 0.013 - x * 0.006 + 1.7) + 0.25 * Math.cos(ft * 0.28 + ph * 6.283));
    return {
      update(t, ft, W, H) {
        const need = !cache || morph.morphing || CW !== W || CH !== H || t - cacheT > 0.5;
        if (need) { cache = build(W, H); CW = W; CH = H; cacheT = t; }
        const out = cache.slice();
        for (let i = 0; i < out.length; i += 4) {
          const x = out[i], y = out[i + 1], r = out[i + 2], ph = out[i + 3];
          const breathe = 1 + 0.04 * Math.sin(ft * (0.09 + 0.035 * ph) + ph * 6.283);
          out[i] = x + wobX(x, y, r, ph, ft); out[i + 1] = y + wobY(x, y, r, ph, ft); out[i + 2] = r * breathe;
        }
        return out;
      },
      invalidate() { cache = null; },
    };
  }

  // 画一团圆组成的云（可天空、可云影）：body/边缘用两层色调，litDir 是朝光方向
  function paintCloud(ctx, circles, colors, opt = {}) {
    const { edge = '#fff', body = '#e6ebf0', shade = '#ccd6e0', lit = [-0.6, -0.8], litW = 20 } = opt;
    ctx.save();
    const path = new Path2D();
    for (let i = 0; i < circles.length; i += 4) {
      path.moveTo(circles[i] + circles[i + 2], circles[i + 1]);
      path.arc(circles[i], circles[i + 1], circles[i + 2], 0, 6.2832);
    }
    ctx.fillStyle = body; ctx.fill(path);
    // 朝光的外沿：把整团云往光方向偏移一点点描亮（只露出窄窄一条）
    ctx.save();
    ctx.clip(path);
    ctx.globalCompositeOperation = 'source-atop';
    const off = litW;
    ctx.strokeStyle = edge; ctx.lineWidth = off * 2;
    ctx.translate(lit[0] * off, lit[1] * off);
    ctx.stroke(path);
    ctx.restore();
    ctx.restore();
  }

  /* ============================================================
     天上整朵飘的云（meadow 的天空云移植）：底下一排大圆、上面堆几个，
     由小圆铺面；整朵随风飘，飘出画面从上风重新进来。
     opts: { R = 114（95×1.2） }
     ============================================================ */
  function makeFreeCloud(x, y, R = 114, rnd = Math.random) {
    const body = [];
    const n = 3 + Math.floor(rnd() * 3), w = R * (1.0 + n * 0.5);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5, r = R * (0.6 - Math.abs(t) * 0.45 + rnd() * 0.12);
      body.push([t * w, -r * 0.55, r]);
    }
    for (let i = 0; i < n - 1; i++) {
      const t = n === 2 ? 0 : i / (n - 2) - 0.5, r = R * (0.55 + rnd() * 0.25);
      body.push([t * w * 0.6 + (rnd() - 0.5) * R * 0.4, -R * (0.5 + rnd() * 0.35), r]);
    }
    if (rnd() < 0.6) body.push([(rnd() - 0.5) * w * 0.3, -R * 1.05, R * (0.4 + rnd() * 0.15)]);
    const ciOf = (px, py) => { let d = 1e9; for (const [cx, cy, r] of body) d = Math.min(d, Math.hypot(px - cx, py - cy) - r); return d; };
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [cx, cy, r] of body) { x0 = Math.min(x0, cx - r); x1 = Math.max(x1, cx + r); y0 = Math.min(y0, cy - r); y1 = Math.max(y1, cy + r); }
    const circles = [];
    const S = 0.62 / 1.2;
    const layer = (G, size, band, bandFn, attach) => {
      for (let gy = Math.floor((y0 - G) / G); gy <= Math.ceil((y1 + G) / G); gy++)
        for (let gx = Math.floor((x0 - G) / G); gx <= Math.ceil((x1 + G) / G); gx++) {
          const px = (gx + 0.1 + rnd() * 0.8) * G, py = (gy + 0.1 + rnd() * 0.8) * G;
          const ci = ciOf(px, py);
          if (ci > 0 || ci < band) continue;
          let r = G * (size[0] + (size[1] - size[0]) * rnd()) * bandFn(ci);
          if (attach) {
            let att = 0;
            for (const [cx, cy, cr] of circles) att = Math.max(att, sstep(0.2 * r, 0.6 * r, cr + r - Math.hypot(cx - px, cy - py)));
            r *= att;
          }
          r *= sstep(5, 11, r);
          if (r > 0.5) circles.push([px, py, r, rnd()]);
        }
    };
    const Rm = R * S;
    layer(Rm, [0.6, 0.95], -1e9, ci => sstep(-0.1 * Rm, -0.7 * Rm, ci), false);
    for (const [cx, cy, r] of body) if (r > 0.75 * Rm) circles.push([cx, cy, r - 0.75 * Rm, rnd()]);
    layer(34 * 0.85, [0.5, 0.9], -1.0 * Rm, ci => sstep(-0.05 * Rm, -0.35 * Rm, ci) * (1 - sstep(-0.7 * Rm, -1.0 * Rm, ci)), true);
    layer(24 * 0.85, [0.45, 0.8], -0.6 * Rm, ci => sstep(0, -0.2 * Rm, ci) * (1 - sstep(-0.4 * Rm, -0.6 * Rm, ci)), true);
    return { x, y, circles, v: 0.7 + rnd() * 0.6, grow: 0, hw: Math.max(-x0, x1) + 20 };
  }
  // 天上的云列表管理：数量跟着 cover 变（0..1 → 0..10 朵），flow 控制飘速和鼓包节奏
  function createFreeClouds(opts = {}) {
    const { getCover, getFlow, R = 114, getH } = opts;
    const list = [];
    return {
      list,
      step(dt, ft, W, H) {
        const taskbar = getH ? getH() : 48;
        const cover = getCover ? getCover() : 0.3, flow = getFlow ? getFlow() : 1;
        const want = Math.round(cover * 10);
        const alive = list.filter(c => !c.dying);
        for (let i = want; i < alive.length; i++) alive[i].dying = true;
        for (let n = alive.length; n < want; n++) {
          let best = null, bestD = -1;
          for (let k = 0; k < 20; k++) {
            const c = makeFreeCloud(Math.random() * W, 80 + Math.random() * (H - taskbar - 120), R);
            const dmin = Math.min(1e9, ...list.map(o => Math.hypot((o.x - c.x) / 1.6, o.y - c.y)));
            if (dmin > bestD) { bestD = dmin; best = c; }
          }
          list.push(best);
        }
        for (let i = list.length - 1; i >= 0; i--) {
          const c = list[i];
          c.x += flow * 10 * c.v * dt;
          c.grow = c.dying ? c.grow - dt * 0.5 : Math.min(1, c.grow + dt * 0.5);
          if (c.grow <= 0) { list.splice(i, 1); continue; }
          if (c.x - c.hw > W + 50) { const n = makeFreeCloud(-c.hw - 50, c.y, R); n.grow = 1; list[i] = n; }
        }
      },
      clear() { list.length = 0; },
    };
  }
  // 整朵云的圆按生长比例 + 呼吸 + 翻动展开成一串 [x,y,r,ph]，交给 paintCloud 画
  function expandCloud(c, ft, dx = 0, dy = 0) {
    const g = c.grow * c.grow * (3 - 2 * c.grow), out = [];
    c.circles.forEach(([ox, oy, r, ph], i) => {
      const rb = r * g * (1 + 0.04 * Math.sin(ft * (0.09 + 0.035 * ph) + ph * 6.283 + i));
      if (rb > 0.5) out.push(c.x + ox + dx, c.y + oy + dy, rb, ph);
    });
    return out;
  }

  /* ============================================================
     群体（boids）：鱼群 / 锦鲤 / 林间小鸟
     opts: {
       n, make(i, rnd) → {x, y, h, v, ...},
       speed: [min, max],
       sep: 分离半径, coh: 聚合半径,
       avoid: (x, y) → 值，< safe 视为障碍（地形场 sample）；省略则不避让
       safe: 障碍阈值,
       bounds: () => [W, H, m],                 出界兜回
       attractor: () => [x, y, r] | null,       群体游向的目标（珊瑚礁、荷叶间隙……）
     }
     ============================================================ */
  function createSchool(opts) {
    const { n, make, speed = [14, 26], sep = 24, coh = 90, avoid = null, safe = 60, bounds, attractor = null } = opts;
    const fish = [];
    for (let i = 0; i < n; i++) fish.push(make(i, Math.random));
    function setCount(want) {
      want = Math.max(0, want | 0);
      while (fish.length > want) fish.pop();
      while (fish.length < want) fish.push(make(fish.length, Math.random));
    }
    function step(dt) {
      const [W, H, m] = bounds();
      const tgt = attractor ? attractor() : null;
      // 群体的局部中心（聚合用）
      const cx = fish.reduce((a, f) => a + f.x, 0) / fish.length;
      const cy = fish.reduce((a, f) => a + f.y, 0) / fish.length;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        let sx = Math.cos(f.h), sy = Math.sin(f.h);
        // 分离：挤在一起的互相推开
        let px = 0, py = 0, nx = 0, ny = 0, cn = 0;
        for (let j = 0; j < fish.length; j++) {
          if (j === i) continue;
          const o = fish[j], dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy);
          if (d < sep && d > 0.01) { px -= dx / d * (1 - d / sep); py -= dy / d * (1 - d / sep); }
          if (d < coh) { nx += dx; ny += dy; cn++; }
        }
        sx += px * 1.6; sy += py * 1.6;
        if (cn) { sx += nx / cn * 0.35; sy += ny / cn * 0.35; }
        // 游向群体目标（珊瑚礁之类）：只轻轻带一下，队形还是散的
        if (tgt) {
          const dx = tgt[0] - f.x, dy = tgt[1] - f.y, d = Math.hypot(dx, dy) || 1;
          if (d > (tgt[2] || 80)) { sx += dx / d * 0.5; sy += dy / d * 0.5; }
        } else if (fish.length) {
          const dx = cx - f.x, dy = cy - f.y, d = Math.hypot(dx, dy) || 1;
          sx += dx / d * 0.1; sy += dy / d * 0.1;
        }
        // 避让地形：探前方，撞上就沿"往外"的方向拐（opts.morph 由主题传入）
        if (avoid && opts.morph) {
          const ax = f.x + sx * 34, ay = f.y + sy * 34;
          if (avoid(ax, ay) < safe) {
            const [ox, oy] = T.outward(opts.morph, f.x, f.y);
            sx += ox * 2.4; sy += oy * 2.4;
          }
        }
        // 出界兜回
        if (f.x < m || f.y < m || f.x > W - m || f.y > H - m) {
          sx += (W / 2 - f.x) * 0.002; sy += (H / 2 - f.y) * 0.002;
        }
        const want = Math.atan2(sy, sx);
        f.h = turnToward(f.h, want, 2.2 * dt);
        f.ph = (f.ph || 0) + dt * 6;                       // 尾摆 / 扇翅的相位，速度也跟着轻轻起伏
        const sp = speed[0] + (speed[1] - speed[0]) * (0.7 + 0.3 * Math.sin(f.ph * 0.5 + f.x * 0.01));
        f.x += Math.cos(f.h) * sp * dt; f.y += Math.sin(f.h) * sp * dt;
      }
    }
    return { fish, step, setCount, center: () => [fish.reduce((a, f) => a + f.x, 0) / fish.length, fish.reduce((a, f) => a + f.y, 0) / fish.length] };
  }

  return {
    sstep, mulberry32, roundRect, addRoundRect, turnToward,
    createCloudMass, paintCloud,
    makeFreeCloud, createFreeClouds, expandCloud,
    createSchool,
  };
})();
