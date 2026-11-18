// Wallpaper · 公共地形场（CPU）——"地形围着图标生成"的主题共用
// 图标矩形做高斯融球，再叠加噪声扭曲 → 得到 s = 到岸线的有符号距离（<0 在地形里、离图标近，>0 在外面）。
// 图标挪动时在新旧两场之间平滑过渡（commit），参数变了直接换（refresh）。
// 从 flat.html / meadow.html 的实现原样移植，公式和下限处理保持一致，保证岸线观感不变。
window.DKT = (function () {
  'use strict';

  const STEP = 5;                    // 场的格子大小（px）
  const MORPH_MS = 1800;             // 图标挪动时岸线过渡的时长
  const GROW_MS = 2600;              // 从空场"长出来"（开场、换一张）的时长

  let seed = (Math.random() * 1e6) | 0;
  let Gw = 1, Gh = 1, NZ = null;     // 场的网格尺寸 + 预算好的扭曲噪声

  /* ---------- 噪声（和主题页一致：hash 整数格 + 平滑插值） ---------- */
  function hash2(x, y, k = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed + k, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, k = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, k), b = hash2(ix + 1, iy, k), c = hash2(ix, iy + 1, k), d = hash2(ix + 1, iy + 1, k);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, k = 0) {
    let a = 0.5, s = 0;
    for (let i = 0; i < 4; i++) { s += a * vnoise(x, y, k + i * 7); x = x * 2.03 + 17.1; y = y * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  /* ---------- 尺寸 / 种子 ---------- */
  function setSize(W, H) {
    Gw = Math.ceil(W / STEP) + 2; Gh = Math.ceil(H / STEP) + 2;
    buildNoise();
  }
  function buildNoise() {
    const N = Gw * Gh;
    NZ = { wx: new Float32Array(N), wy: new Float32Array(N) };
    for (let gy = 0; gy < Gh; gy++) for (let gx = 0; gx < Gw; gx++) {
      const i = gy * Gw + gx, x = gx * STEP, y = gy * STEP;
      NZ.wx[i] = fbm(x * 0.0028, y * 0.0028, 1) - 0.47;
      NZ.wy[i] = fbm(x * 0.0028, y * 0.0028, 2) - 0.47;
    }
  }
  function setSeed(v) { seed = v | 0; buildNoise(); }
  function getSeed() { return seed; }
  function nextSeed() { return (Math.random() * 1e6) | 0; }

  /* ---------- 融球场 ---------- */
  // rects: [{cx, cy, hw, hh}]（图标中心 + 半宽半高）；sigma：离岸距离；warp：岸线曲折
  let fieldMs = 0;
  function computeField(rects, sigma, warp) {
    const t0 = performance.now();
    const N = Gw * Gh, f1 = new Float32Array(N);
    const sig = sigma, is1 = 1 / (sig * sig);
    const wa = warp * 2.2, wmax = wa * 0.5;
    for (const r of rects) {
      const R = 5.5 * sig + Math.max(r.hw, r.hh) * 0.5 + wmax;
      const gx0 = Math.max(0, Math.floor((r.cx - R) / STEP)), gx1 = Math.min(Gw - 1, Math.ceil((r.cx + R) / STEP));
      const gy0 = Math.max(0, Math.floor((r.cy - R) / STEP)), gy1 = Math.min(Gh - 1, Math.ceil((r.cy + R) / STEP));
      const chw = r.hw * 0.5, chh = r.hh * 0.5;
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const i = gy * Gw + gx;
        const qx = gx * STEP + NZ.wx[i] * wa, qy = gy * STEP + NZ.wy[i] * wa;
        let dx = Math.abs(qx - r.cx) - chw, dy = Math.abs(qy - r.cy) - chh;
        if (dx < 0) dx = 0; if (dy < 0) dy = 0;
        f1[i] += Math.exp(-(dx * dx + dy * dy) * is1);
      }
    }
    // 下限 = 计算范围边缘处的贡献值：范围内外算出的"离岸距离"一致，开阔处不会出现方框状的接缝
    const c0 = Math.sqrt(-Math.log(0.35)), s = new Float32Array(N), fMin = Math.exp(-30);
    for (let i = 0; i < N; i++) {
      const g = Math.log(Math.max(f1[i], fMin));
      s[i] = sig * (Math.sqrt(Math.max(-g, 0)) - c0) - sig * 0.6 * Math.max(g, 0);
    }
    fieldMs = performance.now() - t0;
    return { s };
  }
  function sampleArr(a, x, y) {
    const fx = Math.min(Math.max(x / STEP, 0), Gw - 1.001), fy = Math.min(Math.max(y / STEP, 0), Gh - 1.001);
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, i = iy * Gw + ix;
    return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + Gw] * (1 - tx) + a[i + Gw + 1] * tx) * ty;
  }

  /* ---------- 双场过渡 ---------- */
  // getRects()/getSigma()/getWarp()：取当前图标矩形和岸线参数（参数变化时场要按新值重算）
  function createMorph(getRects, getSigma, getWarp) {
    const m = {
      FA: null, FB: null, curMix: 1,
      _t0: -1e9, _dur: MORPH_MS,
      commit(fromEmpty = false) {
        const nf = computeField(getRects(), getSigma(), getWarp());
        if (fromEmpty || !m.FA) m.FA = computeField([], getSigma(), getWarp());
        else m.FA = m.FB;
        m.FB = nf;
        m._t0 = performance.now();
        m._dur = fromEmpty ? GROW_MS : MORPH_MS;
      },
      refresh() {
        m.FA = m.FB = computeField(getRects(), getSigma(), getWarp());
        m.curMix = 1; m._t0 = -1e9;
      },
      sample(x, y) {
        return m.FB ? sampleArr(m.FA.s, x, y) * (1 - m.curMix) + sampleArr(m.FB.s, x, y) * m.curMix : 999;
      },
      tick(now) {
        const e = Math.min((now - m._t0) / m._dur, 1);
        m.curMix = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
        return m.curMix;
      },
      // 场还在过渡中（小物体要按当前场挑出生点时用）
      get morphing() { return m.curMix < 1; },
    };
    return m;
  }

  /* ---------- 按场梯度找"往外"的方向（小物体避让地形用） ---------- */
  function outward(morph, x, y, d = 8) {
    const gx = morph.sample(x + d, y) - morph.sample(x - d, y);
    const gy = morph.sample(x, y + d) - morph.sample(x, y - d);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  }

  return {
    STEP, MORPH_MS, GROW_MS,
    hash2, vnoise, fbm,
    setSize, buildNoise, setSeed, getSeed, nextSeed,
    computeField, sampleArr,
    createMorph, outward,
    get fieldMs() { return fieldMs; },
  };
})();
