// infinite.js: "Infinite subagents", 15 s, loops. See STORYBOARD.md.
// Clawd gets a coffee task, spawns a subagent, which spawns subagents, until hundreds of them build a machine that
// produces one tiny cup. Clawd sips it: needs sugar. Everyone starts over.
// No GPU in the render box: LITE turns every watercolour fill into a flat translucent wash (see paintAt in core.js).
(() => {
  window.LITE = true;
  const C = {
    wall: '#F1E6D0', wallDk: '#E2CFAE', desk: '#6F9C98', deskDk: '#557D7A', deskLt: '#8DB5AF', edge: '#4B6F6C',
    note: '#F6D66B', noteDk: '#E0B843', coffee: '#6B4128', bean: '#5A3520', beanLt: '#8A5A3A', cup: '#FFF5E2',
    wood: '#B98552', woodDk: '#8C5F37', metal: '#9AA3B5', metalDk: '#6E7689', board: '#FBF7EE', sack: '#C9A36B', sky: '#A9D3EA',
  };
  const GY = 870, MX = 960, MU = 26;
  // key times (video seconds)
  const tNote = .35, tLook = .55, tDet = 1.0, tCr1 = 1.38, tCr2 = 1.62, tThink = 1.92, tIdea = 2.62, tPoint = 2.98, tPop1 = 3.05,
        tCasc = 4.35, tFill = 7.2, tDing = 9.4, tPick = 9.55, tWalk0 = 9.95, tWalk1 = 11.85, tTurn = 12.08, tTake = 12.28,
        tSip = 12.5, tSip1 = 12.95, tFlat = 13.12, tBack = 13.6, tBubble = 13.68, tFreeze = 14.0, tGo = 14.3, tWipe = 14.65;
  // "activity time": the swarm works on this clock. It stops dead at the ding and restarts, fast, at tGo.
  const act = t => t < tDing ? t : t < tGo ? tDing + .1 * (1 - Math.exp(-(t - tDing) * 12)) : tDing + .1 + (t - tGo) * 2.4;
  const uAt = y => 10.5 + 4 * clamp((y - 700) / 1250);

  // ---------- camera ----------
  const CAMK = [
    [0, [960, 600, 1]], [2.6, [990, 610, 1.05]], [3.2, [1090, 640, 1]], [4.4, [1160, 660, .95]],
    [6.5, [950, 820, .45]], [7.5, [880, 830, .46]], [8.7, [1900, 780, .55]], [9.3, [2400, 760, .95]], [9.5, [2410, 760, .97]],
    [10.2, [2150, 760, .85]], [11.8, [1330, 720, .9]], [12.08, [1300, 710, .92]], [12.5, [1090, 690, 1.25]],
    [13.9, [1110, 690, 1.3]], [14.1, [1150, 790, .6]], [15, [1170, 790, .6]]
  ].map(([t, v]) => [t, [v[0], v[1], Math.log(v[2])]]);
  const camAt = t => { const [x, y, lz] = kf(t, CAMK); return [x + 12 * Math.sin(t * .7), y + 6 * Math.sin(t * .9 + 1), Math.exp(lz)]; };

  // ---------- arm tips in world space (so props can pass between characters) ----------
  function armTip(x, y, u, o, which) {
    const V = o.view || 'front', sq = o.sq || 0, sm = clamp(o.smear || 0);
    const SX = (o.flip ? -1 : 1) * (o.sx ?? 1) * (1 + sq * .6) * (1 + sm * .35), SY = (o.sy ?? 1) * (1 - sq);
    let lx, ly;
    if (V === 'side') { const a = o.aL ?? .2, r = .7 - a; lx = 1.6 * u + 2.1 * u * Math.cos(r); ly = -4.2 * u + 2.1 * u * Math.sin(r); }
    else {
      const a = which === 'L' ? (o.aL ?? .2) : (o.aR ?? .2), dir = which === 'L' ? -1 : 1;
      const rx = (4.9 + .55 * clamp((Math.abs(a) - .7) / .9)) * u * dir;
      lx = rx + dir * 2.2 * u * Math.cos(a); ly = -4.5 * u - 2.2 * u * Math.sin(a);
    }
    lx *= SX; ly *= SY;
    const r = o.rot || 0, c = Math.cos(r), s = Math.sin(r);
    return [x + (o.dx || 0) * u + lx * c - ly * s, y + (o.dy || 0) * u + lx * s + ly * c];
  }


  // ---------- a 2D ink painter ----------
  // While G2 (a 2D canvas context) is set, paint2()/ink2() draw flat colour and a wobbly double ink line on it instead
  // of through p5.brush. The static set (room, machine, board, sack) and the wipes use it: on a software GPU, every
  // large p5.brush shape costs about a second a frame. Otherwise they are plain paint()/inkLine().
  let G2 = null;
  const INKW = { ink: 3.2, inkfine: 1.9, dry: 5 };
  const T2 = {
    push() { push(); if (G2) G2.save(); }, pop() { pop(); if (G2) G2.restore(); },
    tr(x, y) { translate(x, y); if (G2) G2.translate(x, y); }, rot(a) { rotate(a); if (G2) G2.rotate(a); },
  };
  function path2(pts, closed, curv) {
    const g = G2, P = pts.map(([x, y]) => [x + jit(.8), y + jit(.8)]);
    g.beginPath();
    if (curv && P.length > 2) {
      const n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (closed) { const m0 = mid(P[n - 1], P[0]); g.moveTo(...m0); for (let i = 0; i < n; i++) { const m = mid(P[i], P[(i + 1) % n]); g.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); } }
      else { g.moveTo(...P[0]); for (let i = 1; i < n - 1; i++) { const m = mid(P[i], P[i + 1]); g.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); } g.lineTo(...P[n - 1]); }
    } else { P.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); if (closed) g.closePath(); }
  }
  function stroke2(w, col) {
    const g = G2; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = w; g.stroke(); g.globalAlpha *= .3; g.lineWidth = w * 1.7; g.stroke(); g.globalAlpha /= .3;
  }
  function paint2(pts, o = {}) {
    if (!G2) return paint(pts, o);
    const g = G2, col = o.wash || o.fill, op = o.wash ? (o.washOp ?? 255) : (o.fillOp ?? 170) * .6;
    if (col) { path2(pts, true, o.curv); g.globalAlpha = op / 255; g.fillStyle = col; g.fill(); g.globalAlpha = 1; }
    if (o.ink !== null) { path2(pts, true, o.curv); stroke2(INKW[o.br || 'ink'] * (o.sw ?? 1), o.ink || PAL.ink); }
  }
  function ink2(pts, sw = 1, col = PAL.ink, br = 'ink', curv = .5) {
    if (!G2) return inkLine(pts, sw, col, br, curv);
    path2(pts, false, curv); stroke2((INKW[br] || 3) * sw, col);
  }
  // a painted layer: fn draws on a clear full-frame 2D canvas (in world space when a camera is active), which is then
  // laid over everything painted so far
  const LGS = {};   // one canvas per layer: p5 caches a graphics' texture, so reusing one canvas twice a frame shows stale pixels
  function layer2(fn, screen = false, slot = 'bg') {
    if (!LGS[slot]) { LGS[slot] = createGraphics(W, H); LGS[slot].pixelDensity(1); }
    const LG = LGS[slot], g = LG.drawingContext;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    if (CAM && !screen) { const z = CAM.zoom; g.setTransform(z, 0, 0, z, W / 2 - CAM.cx * z, H / 2 - CAM.cy * z); }
    G2 = g; fn(g); G2 = null;
    flushBrush();
    push(); resetMatrix(); translate(-W / 2, -H / 2); image(LG, 0, 0); pop();
  }
  // the brush wipe (see brushWipe in timeline.js), on the 2D layer
  function wipe2(p, cols) {
    if (p <= 0 || p >= 1) return;
    layer2(g => {
      const [c1, c2] = cols, n = 5, bh = (H + 420) / n + 40;
      g.translate(W / 2, H / 2); g.rotate(-.1); g.translate(-W / 2, -H / 2);
      for (let i = 0; i < n; i++) {
        const y0 = -230 + i * (H + 420) / n, d = [0, .14, .06, .18, .1][i];
        const q = p < .5 ? easeOut(clamp((p * 2 - d) / (1 - d))) : ease(clamp(((p - .5) * 2 - d) / (1 - d)));
        const x0 = p < .5 ? -300 : lerp(-300, W + 400, q), x1 = p < .5 ? lerp(-300, W + 400, q) : W + 400;
        if (x1 - x0 < 30) continue;
        boilSeed('wipe' + i);
        const pts = [], rag = k => 40 + 50 * hash(i * 31 + k) + jit(12);
        for (let k = 0; k <= 8; k++) pts.push([lerp(x0, x1, k / 8), y0 + Math.sin(k * .9 + i) * 14 + jit(5)]);
        for (let k = 1; k < 9; k++) pts.push([x1 + rag(k) - 40, y0 + bh * k / 9]);
        for (let k = 8; k >= 0; k--) pts.push([lerp(x0, x1, k / 8), y0 + bh + Math.sin(k * .8 + i * 2) * 14 + jit(5)]);
        if (p >= .5) for (let k = 8; k > 0; k--) pts.push([x0 - rag(k + 20) + 40, y0 + bh * k / 9]);
        paint2(pts, { wash: i % 2 ? c1 : c2, ink: null });
        for (let k = 0; k < 7; k++) { const yy = y0 + bh * (k + .5) / 7, xa = x0 + (x1 - x0) * .1 * hash(k + i * 9), xb = x1 - 60 - 200 * hash(k + i * 5); if (xb > xa) ink2([[xa, yy], [xb, yy + jit(6)]], 1.4, i % 2 ? c2 : PAL.cream, 'dry', .3); }
      }
    }, true, 'wipe');
  }

  // ---------- props ----------
  // the coffee cup: (x, y) = its centre, s = its height. level 0..1 of coffee, steam 0..1, tilt in radians
  function cup(x, y, s, o = {}) {
    const sw = clamp(s / 40, .35, .9);
    T2.push(); T2.tr(x, y); T2.rot(o.tilt || 0);
    const w = s * .9, h = s;
    paint2(ellPts(w * .55, -h * .05, s * .28, s * .26, 12), { ink: PAL.ink, sw: sw * .9 });   // handle
    paint2([[-w / 2, -h / 2], [w / 2, -h / 2], [w * .4, h / 2], [-w * .4, h / 2]], { wash: C.cup, ink: PAL.ink, sw, curv: .15 });
    paint2(ellPts(0, -h / 2, w / 2, s * .12, 14), { wash: (o.level ?? 1) > .05 ? C.coffee : mixCol(C.cup, PAL.ink, .15), ink: PAL.ink, sw: sw * .8 });
    paint2(rectPts(-w * .43, -h * .05, w * .86, h * .16), { wash: PAL.rose, washOp: 200, ink: null });   // a stripe
    T2.pop();
    const st = o.steam ?? 0;
    if (st > .02) for (let i = 0; i < 3; i++) {
      boilSeed('steam' + i + (o.key || ''));
      const ph = frac(T * .9 + i / 3), sx = x + (i - 1) * s * .28, sy = y - s * (.75 + ph * 1.2);
      ink2([[sx, sy + s * .5], [sx + s * .12 * Math.sin(T * 4 + i), sy + s * .25], [sx - s * .1, sy]], sw * 1.1 * st * Math.sin(ph * Math.PI), mixCol(PAL.cream, PAL.ink, .25), 'inkfine', .6);
    }
  }
  function bean(x, y, s, rot = 0) {
    T2.push(); T2.tr(x, y); T2.rot(rot);
    paint2(ellPts(0, 0, s, s * .7, 12), { wash: C.bean, ink: PAL.ink, sw: clamp(s / 20, .3, .7) });
    ink2([[-s * .6, -s * .1], [0, s * .12], [s * .6, -s * .1]], clamp(s / 25, .25, .6), C.beanLt, 'inkfine', .5);
    T2.pop();
  }
  function sugar(x, y, s, key = 'sugar') {   // a sugar cube, drawn as a flat icon: top, left and right faces
    boilSeed(key);
    const h = s * .5, top = [[x, y - s], [x + s, y - s + h], [x, y - s + 2 * h], [x - s, y - s + h]];
    paint2([[x - s, y - s + h], [x, y - s + 2 * h], [x, y + s], [x - s, y + s - h]], { wash: '#EFE6D4', ink: PAL.ink, sw: clamp(s / 40, .4, 1) });
    paint2([[x, y - s + 2 * h], [x + s, y - s + h], [x + s, y + s - h], [x, y + s]], { wash: '#DCD0BA', ink: PAL.ink, sw: clamp(s / 40, .4, 1) });
    paint2(top, { wash: '#FFFDF7', ink: PAL.ink, sw: clamp(s / 40, .4, 1) });
    for (let i = 0; i < 5; i++) paint2(ellPts(x + (hash(i + 3) - .5) * s, y - s + h + (hash(i + 9) - .5) * h * .8, s * .05, s * .04, 6), { wash: '#D8CCB6', ink: null });
  }
  function puff(x, y, r, k, key) {   // a pop: a cloud that bursts and fades
    if (k <= 0 || k >= 1) return;
    boilSeed('puff' + key);
    const R = r * (.4 + .9 * easeOut(k)), P = [];
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, b = 1 + .3 * Math.abs(Math.sin(a * 3 + key)); P.push([x + Math.cos(a) * R * b, y + Math.sin(a) * R * .75 * b]); }
    paint2(P, { wash: PAL.cream, washOp: 255 * (1 - k * k), ink: k < .6 ? PAL.ink : null, sw: clamp(r / 50, .4, 1), curv: .5 });
    if (k < .5) for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + key, d = R * (1.2 + .6 * k);
      ink2([[x + Math.cos(a) * d, y + Math.sin(a) * d * .75], [x + Math.cos(a) * (d + r * .35), y + Math.sin(a) * (d + r * .35) * .75]], clamp(r / 60, .35, .9), PAL.ink, 'inkfine', 0);
    }
  }
  function sparkle(x, y, r, k, key = 's') { if (k > 0 && k < 1) { boilSeed('spk' + key); paint2(starPts(x, y, r * backOut(k) * (1 - k * .6), .25, 4, k * 2), { wash: PAL.cream, washOp: 255 * (1 - k * k), ink: PAL.ink, sw: .5 }); } }
  function crackMark(x, y, r, k, key) {   // knuckle crack: short strokes bursting out
    if (k <= 0 || k >= 1) return;
    boilSeed('crack' + key);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * .55, d0 = r * (.5 + .5 * k), d1 = r * (1 + .9 * easeOut(k));
      ink2([[x + Math.cos(a) * d0, y + Math.sin(a) * d0], [x + Math.cos(a) * d1, y + Math.sin(a) * d1]], 1.1 * (1 - k), PAL.ink, 'ink', 0);
    }
  }

  // ---------- the room ----------
  function room(t) {
    boilSeed('wall');
    paint2(rectPts(-1600, -900, 5600, 1560), { wash: C.wall, ink: null });
    boilSeed('window');   // a window, far left, only seen in the wide
    paint2(rectPts(-900, -300, 620, 560, 3), { wash: C.sky, ink: PAL.ink, sw: 1.6 });
    paint2(ellPts(-700, 180, 260, 70, 16, 4), { wash: '#E9F3F6', washOp: 220, ink: null });
    ink2([[-590, -300], [-590, 260]], 1.6, PAL.ink, 'ink', 0); ink2([[-900, -20], [-280, -20]], 1.6, PAL.ink, 'ink', 0);
    boilSeed('shelf');
    paint2(rectPts(2350, -90, 700, 26, 2), { wash: C.wood, ink: PAL.ink, sw: 1.2 });
    for (let i = 0; i < 6; i++) paint2(rectPts(2400 + i * 62, -90 - 110 - 30 * hash(i), 48, 110 + 30 * hash(i), 2), { wash: [PAL.rose, PAL.teal, PAL.ochre, PAL.violet, PAL.sap, PAL.indigo][i], ink: PAL.ink, sw: 1 });
    boilSeed('desk');
    paint2(rectPts(-1600, 620, 5600, 1600), { wash: C.desk, ink: null });
    paint2(rectPts(-1600, 620, 5600, 26), { wash: C.deskLt, ink: null });
    for (let i = 0; i < 14; i++) {   // grain
      const y = 700 + i * 95 + 30 * hash(i), x0 = -1500 + 2400 * hash(i + 20), L = 500 + 900 * hash(i + 40);
      ink2([[x0, y], [x0 + L * .5, y + 8 * (hash(i + 5) - .5)], [x0 + L, y]], .7, C.deskDk, 'inkfine', .5);
    }
    for (let k = 0; k < 3; k++) ink2([[-1600 + k * 1860, 622], [-1600 + (k + 1) * 1860, 622]], 1.4, PAL.ink, 'ink', 0);
  }
  // the sticky note, with a coffee cup icon
  function note(t, x, y) {
    const k = seg(t, tNote, tNote + .3); if (k <= 0) return;
    const s = backOut(k) * 115, r = -.06 + .04 * spring(t, tNote + .15, 5, 14);
    boilSeed('note');
    T2.push(); T2.tr(x, y); T2.rot(r);
    paint2(rectPts(-s, -s, 2 * s, 2 * s, 3), { wash: C.note, ink: PAL.ink, sw: 1.2 });
    paint2([[s * .55, s], [s, s * .55], [s, s]], { wash: C.noteDk, ink: PAL.ink, sw: .8 });
    paint2(ellPts(0, -s * .9, s * .1, s * .1, 10), { wash: PAL.rose, ink: PAL.ink, sw: .8 });
    T2.pop();
    if (k > .3) cup(x - 8, y + 18, s * .75, { level: 1, steam: 1, key: 'note' });
  }
  // the thought bubble with a sugar cube
  function bubble(t, x, y) {
    const k = seg(t, tBubble, tBubble + .25); if (k <= 0) return;
    const p = backOut(k), s = 95 * p;
    boilSeed('bubble');
    [[x - 150, y + 150, 13], [x - 105, y + 100, 21]].forEach(([bx, by, r], i) => { if (k > i * .25) paint2(ellPts(bx, by, r * p, r * p, 12), { wash: PAL.cream, ink: PAL.ink, sw: 1 }); });
    const P = []; for (let i = 0; i < 28; i++) { const a = i / 28 * TAU, b = 1 + .12 * Math.abs(Math.sin(a * 4)); P.push([x + Math.cos(a) * s * 1.35 * b, y + Math.sin(a) * s * b]); }
    paint2(P, { wash: PAL.cream, ink: PAL.ink, sw: 1.2, curv: .5 });
    if (k > .4) {
      sugar(x - 6, y + 4, 52 * p, 'bsugar');
      sparkle(x + 60, y - 50, 22, frac((t - tBubble) * 1.4), 'b1');
      sparkle(x - 70, y + 40, 14, frac((t - tBubble) * 1.4 + .5), 'b2');
    }
  }

  // ---------- the machine (a Rube Goldberg coffee machine) ----------
  const WX = 2720, WY = 560, WR = 130, CRX = 2215, CRY = 720, SPX = 2520, CUPY = 852;
  const RAMP = [[2235, 392], [2222, 418], [2520, 478], [2532, 500], [2272, 578], [2284, 600], [2315, 648]];
  const polyLen = P => { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return L; };
  const RL = polyLen(RAMP);
  function along(P, L, s) {   // point at distance s along polyline P (L = cumulative lengths)
    s = clamp(s, 0, L[L.length - 1]);
    let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const k = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), a = P[i - 1], b = P[i];
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), b[0] - a[0], b[1] - a[1]];
  }
  function machine(t) {
    const a = act(t);
    boilSeed('scaffold');
    // ladder + platform + posts
    for (const x of [1932, 1992]) ink2([[x, 865], [x, 318]], 1.6, C.woodDk, 'ink', 0);
    for (let i = 0; i < 11; i++) ink2([[1932, 850 - i * 50], [1992, 850 - i * 50]], 1.2, C.woodDk, 'ink', 0);
    paint2(rectPts(1920, 318, 290, 22, 2), { wash: C.wood, ink: PAL.ink, sw: 1.2 });
    ink2([[2190, 340], [2190, 865]], 1.6, C.woodDk, 'ink', 0);
    // hopper full of beans
    boilSeed('hopper');
    paint2([[2150, 250], [2330, 250], [2250, 385], [2225, 385]], { wash: C.metal, ink: PAL.ink, sw: 1.2 });
    for (let i = 0; i < 9; i++) bean(2175 + i * 18, 258 + 6 * hash(i), 11, hash(i + 4) * 3);
    // ramps
    boilSeed('ramps');
    ink2([[2215, 425], [2525, 486]], 2.2, C.woodDk, 'ink', 0);
    ink2([[2530, 508], [2275, 586]], 2.2, C.woodDk, 'ink', 0);
    for (const [x, y] of [[2515, 486], [2290, 586]]) ink2([[x, y], [x, 865]], 1.1, C.woodDk, 'inkfine', 0);
    // beans rolling down the ramps
    if (t < tDing + .2) for (let k = 0; k < 3; k++) {
      boilSeed('rb' + k);
      const p = along(RAMP, RL, frac(a * .55 + k / 3) * RL[RL.length - 1]);
      bean(p[0], p[1] - 9, 10, a * 9 + k);
    }
    // grinder with crank
    boilSeed('grinder');
    paint2(rrPts(2235, 640, 170, 160, 18, 2), { wash: PAL.rose, ink: PAL.ink, sw: 1.3 });
    paint2(ellPts(2320, 700, 38, 38, 16), { wash: C.cream || PAL.cream, ink: PAL.ink, sw: 1 });
    const ga = a * 5; ink2([[2320, 700], [2320 + 30 * Math.cos(ga), 700 + 30 * Math.sin(ga)]], 1.2, PAL.ink, 'ink', 0);
    for (const x of [2250, 2390]) ink2([[x, 800], [x, 865]], 1.4, PAL.ink, 'ink', 0);
    const ca = a * 4.2, hx = CRX + 36 * Math.cos(ca), hy = CRY + 36 * Math.sin(ca);
    ink2([[CRX + 20, CRY], [CRX, CRY], [hx, hy]], 1.6, PAL.ink, 'ink', 0);
    paint2(ellPts(hx, hy, 8, 8, 8), { wash: PAL.ochre, ink: PAL.ink, sw: .8 });
    // pipe to the spout
    boilSeed('pipe');
    paint2([[2300, 800], [2330, 800], [2330, 790], [SPX + 14, 790], [SPX + 14, 815], [SPX - 14, 815], [SPX - 14, 804], [2300, 804]], { wash: C.metal, ink: PAL.ink, sw: 1 });
    // hamster wheel on a stand, belted to the grinder
    boilSeed('wheel');
    ink2([[WX, WY], [WX - 80, 865]], 1.8, C.woodDk, 'ink', 0); ink2([[WX, WY], [WX + 80, 865]], 1.8, C.woodDk, 'ink', 0);
    ink2([[WX, WY - 12], [2320, 688]], .9, PAL.ink, 'inkfine', 0); ink2([[WX, WY + 12], [2320, 712]], .9, PAL.ink, 'inkfine', 0);
    paint2(ellPts(WX, WY, WR, WR, 32), { wash: '#F7E7C4', washOp: 150, ink: PAL.ink, sw: 1.6 });
    const wa = -a * 2.6; for (let i = 0; i < 6; i++) { const q = wa + i * TAU / 6; ink2([[WX, WY], [WX + Math.cos(q) * WR, WY + Math.sin(q) * WR]], .9, C.woodDk, 'inkfine', 0); }
    paint2(ellPts(WX, WY, 12, 12, 10), { wash: C.metalDk, ink: PAL.ink, sw: .8 });
    // the drip and the tiny cup
    boilSeed('drip');
    const lvl = seg(t, tFill, tDing);
    if (t > tFill - .3 && t < tDing) { const d = frac(a * 2.4); paint2(ellPts(SPX, lerp(820, 842, d), 4, 6, 8), { wash: C.coffee, ink: null }); }
    if (t < tPick) cup(SPX, CUPY, 34, { level: lvl, steam: seg(t, tDing - .2, tDing + .1), key: 'm' });
    if (t > tDing) { glowless(t); }
  }
  function glowless(t) { const k = seg(t, tDing, tDing + .55); sparkle(SPX, CUPY - 40, 60, k, 'ding'); sparkle(SPX + 40, CUPY - 70, 30, seg(t, tDing + .08, tDing + .5), 'ding2'); }

  function whiteboard(t) {
    boilSeed('board');
    for (const x of [-440, -60]) ink2([[x, 740], [x - 20 * Math.sign(x + 250), 850]], 1.6, C.woodDk, 'ink', 0);
    paint2(rectPts(-480, 500, 460, 260, 2), { wash: C.board, ink: PAL.ink, sw: 1.4 });
    // the plan: boxes, arrows, a cup at the end (no words)
    const bx = [[-450, 560], [-330, 640], [-200, 560]];
    bx.forEach(([x, y], i) => paint2(rectPts(x, y, 80, 55, 2), { ink: [PAL.indigo, PAL.rose, PAL.teal][i], sw: .9 }));
    ink2([[-370, 600], [-340, 640]], .9, PAL.indigo, 'inkfine', 0); ink2([[-250, 660], [-200, 615]], .9, PAL.rose, 'inkfine', 0);
    ink2([[-120, 590], [-90, 590]], .9, PAL.teal, 'inkfine', 0);
    cup(-65, 600, 32, { level: 1 });
    ink2([[-440, 700], [-400, 690], [-350, 715], [-290, 700], [-250, 720]], .7, PAL.ink, 'inkfine', .6);
    ink2([[-200, 690], [-150, 700], [-100, 685]], .7, PAL.ink, 'inkfine', .6);
  }
  function sack(t) {
    boilSeed('sack');
    paint2([[-800, 1520], [-820, 1400], [-760, 1310], [-690, 1290], [-610, 1300], [-560, 1360], [-540, 1470], [-570, 1530]], { wash: C.sack, ink: PAL.ink, sw: 1.4, curv: .4 });
    ink2([[-770, 1320], [-720, 1340], [-640, 1330], [-590, 1310]], 1.2, PAL.ink, 'ink', .5);
    for (let i = 0; i < 16; i++) bean(-760 + 200 * hash(i + 50), 1300 + 30 * hash(i + 60) - 20 * Math.sin(hash(i + 50) * Math.PI), 13, hash(i) * 6);
    for (let i = 0; i < 10; i++) bean(-560 + 140 * hash(i + 80), 1500 + 50 * hash(i + 90), 13, hash(i + 3) * 6);
  }

  // ---------- the swarm ----------
  // Every mini is a pure function of t: it pops out of its parent at ts, hops to where its job is, and works on the
  // activity clock act(t). ids 0-3 are the first four (0 is the one that brings the coffee).
  const PATH = [[-560, 1440], [-100, 1330], [400, 1215], [900, 1130], [1400, 1060], [1720, 965], [1930, 872]], PL = polyLen(PATH);
  const L0 = [[1330, 890], [1640, 905], [1480, 1010], [1210, 1050]];
  const OP = [2600, 886], ARRIVE = 1185;
  const inBox = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3];
  const KEEPOUT = [[640, 700, 1300, 1000], [-700, 760, 120, 1080], [1880, 690, 2860, 900], [-900, 1260, -440, 1640], [120, 1230, 600, 1460]];
  const M = [];
  const specials = [
    { job: 'op' }, { job: 'wander', ax: 1500, ay: 1250, rx: 150, ry: 40 }, { job: 'wander', ax: 1150, ay: 1450, rx: 120, ry: 60 }, { job: 'wander', ax: 1700, ay: 1180, rx: 100, ry: 30 }];
  const rest = [];
  for (let i = 0; i < 30; i++) rest.push({ job: 'beans', off: i / 30 });
  for (let i = 0; i < 2; i++) rest.push({ job: 'ladder', off: i * .5 });
  rest.push({ job: 'top' }, { job: 'wheel' }, { job: 'crank' }, { job: 'grinder' }, { job: 'present' }, { job: 'sleep' });
  for (let i = 0; i < 8; i++) rest.push({ job: 'audience', k: i });
  let n = 0;
  for (let i = 0; rest.length < 44 + 200 && i < 4000; i++) {
    const ax = -1050 + 4100 * hash(i * 3.1 + 1), ay = 700 + 1250 * hash(i * 5.7 + 2);
    if (KEEPOUT.some(b => inBox(ax, ay, [b[0] - 90, b[1] - 40, b[2] + 90, b[3] + 40]))) continue;
    rest.push({ job: 'wander', ax, ay, rx: 50 + 170 * hash(i + 11), ry: 10 + 40 * hash(i + 12) });
    n++;
  }
  // give each job its fixed data, then order the cascade outward from the first four
  const all = [...specials, ...rest];
  all.forEach((m, i) => {
    m.h = hash(i * 1.37 + 7); m.h2 = hash(i * 2.11 + 3); m.h3 = hash(i * 3.3 + 5);
    if (m.job === 'wander') { m.w = .7 + 1.1 * m.h; m.w2 = .5 + m.h2; m.ph = m.h3 * TAU; m.carry = m.h2 < .25 ? 'bean' : null; m.hat = m.h3 > .85 ? 'hard' : null; }
  });
  const guessPos = m => jobBase(m, 6.5, true);
  const first = all.slice(0, 4), later = all.slice(4);
  later.forEach(m => { const [x, y] = guessPos(m); m.d = Math.hypot(x - 1400, (y - 960) * 1.4) + 300 * m.h; });
  later.sort((a, b) => a.d - b.d);
  first.concat(later).forEach((m, i) => { m.id = i; M.push(m); });
  const ts = i => i === 0 ? tPop1 : i === 1 ? 3.62 : i === 2 ? 3.98 : i === 3 ? 4.16 : tCasc + .31 * Math.log2(i / 4);
  const parentOf = i => i === 0 ? -1 : i === 1 ? 0 : i === 2 ? 1 : i === 3 ? 0 : Math.floor(i / 2);
  window.SWARM = { n: M.length, ts: M.map((m, i) => ts(i)) };   // for the sound script

  // where the job puts a mini at time t: [x, y, {pose}]
  function jobBase(m, t, guess = false) {
    const a = act(t);
    switch (m.job) {
      case 'wander': {
        const x = m.ax + m.rx * Math.sin(m.w * a + m.ph), y = m.ay + m.ry * Math.sin(m.w2 * a + m.ph * 1.7);
        const vx = m.rx * m.w * Math.cos(m.w * a + m.ph);
        return [x, y, { view: Math.abs(vx) > 40 ? 'side' : 'q', flip: vx < 0, walk: a * m.w * 1.4 + m.h * 3 }];
      }
      case 'beans': {
        const s = frac(m.off + a * .04) * PL[PL.length - 1], p = along(PATH, PL, s);
        return [p[0], p[1], { view: 'side', walk: s / 45, carry: 'bean', aL: 1.45 }];
      }
      case 'ladder': { const k = .5 - .5 * Math.cos(a * 1.1 + m.off * TAU); return [1962, lerp(862, 330, k), { view: 'back', walk: a * 2.2, climb: true, carry: 'bean', sortY: 866 }]; }
      case 'top': return [2080, 318, { view: 'side', hat: 'hard', rot: .12 * Math.max(0, Math.sin(a * 3)), aL: .6 + .5 * Math.max(0, Math.sin(a * 3)), sortY: 866 }];
      case 'wheel': return [WX, WY + WR - 6, { view: 'side', walk: a * 3.2, run: true, sortY: 866 }];
      case 'crank': { const ca = a * 4.2; return [2150, 884, { view: 'side', aL: .3 - .5 * Math.sin(ca), dx: .15 * Math.cos(ca), hat: 'hard' }]; }
      case 'grinder': return [2330, 640, { view: 'front', hat: 'hard', aR: .9 + .6 * Math.sin(a * 7), aL: -.3, wrench: true, sortY: 866 }];
      case 'present': return [-560, 862, { view: 'side', aL: .55 + .25 * Math.sin(a * 4), pointer: true }];
      case 'audience': return [-420 + m.k * 52 + (m.k % 2) * 10, 945 + (m.k % 2) * 60, { view: m.k % 3 === 1 ? 'qback' : 'back', flip: m.k % 3 === 1 && m.k > 3 }];
      case 'sleep': return [440, 1370, { sleep: true }];
      case 'op': {
        const x = t < tWalk0 ? OP[0] : lerp(OP[0], ARRIVE, ease(seg(t, tWalk0, tWalk1)));
        return [x, OP[1], { view: 'side', flip: true }];
      }
    }
    return [0, 0, {}];
  }

  // parting: minis on the walker's path step up or down out of the way, and stay there
  function parted(m, x, y, t) {
    if (m.id === 0 || t < 9.55) return y;
    const lo = GY - 105, hi = GY + 115;
    if (x < 1140 || x > 2560 || y < lo || y > hi || ['ladder', 'top', 'wheel', 'grinder'].includes(m.job)) return y;
    const k = ease(seg(t, 9.55 + .3 * m.h, 10.0 + .3 * m.h));
    return y < GY + 5 ? lerp(y, lo - 20 - 30 * m.h2, k) : lerp(y, hi + 20 + 30 * m.h2, k);
  }

  let MEMO = new Map(), MEMOT = -1;
  function posAt(i, t) {
    if (MEMOT !== T) { MEMO = new Map(); MEMOT = T; }
    const key = i + '|' + t; if (MEMO.has(key)) return MEMO.get(key);
    const m = M[i], t0 = ts(i);
    let r;
    if (t < t0) r = null;
    else {
      let [x, y, pose] = jobBase(m, t);
      if (i < 4) {   // the first four land by Clawd, then run off to their jobs
        const k = ease(seg(t, 5.2 + i * .12, 6.5));
        const [jx, jy] = jobBase(m, Math.max(t, 6.5));
        x = lerp(L0[i][0], jx, k); y = lerp(L0[i][1], jy, k);
        if (k > 0 && k < 1) pose = { view: 'side', flip: jx < L0[i][0], walk: t * 4, run: true };
        else if (k === 0) pose = { view: 'front' };
      }
      y = parted(m, x, y, t);
      const pi = parentOf(i), dur = i < 4 ? .42 : .3 + Math.min(.55, Math.hypot(x - 1400, y - 960) / 3000);
      const land = i < 4 ? L0[i] : null;
      if (t < t0 + dur) {
        const src = pi < 0 ? armTip(MX, GY, MU, { aR: .15 }, 'R') : (posAt(pi, t0) || { x: MX, y: GY });
        const s = pi < 0 ? { x: src[0], y: src[1] + 60 } : src;
        const dst = land || [x, y], k = easeOut(seg(t, t0, t0 + dur)), d = Math.hypot(dst[0] - s.x, dst[1] - s.y);
        const p = arcPt([s.x, s.y], dst, 60 + d * .35, k);
        x = p[0]; y = p[1]; pose = { ...pose, hop: k, view: 'front', walk: null };
      }
      r = { x, y, pose, age: t - t0 };
    }
    MEMO.set(key, r); return r;
  }

  const MOODS = ['determined', 'excited', 'happy', 'determined', 'playful', 'nervous', 'determined', 'happy'];
  function miniOpts(m, st, t) {
    const u = uAt(st.y), P = st.pose, a = act(t);
    let mood = m.job === 'sleep' ? 'sleepy' : m.job === 'present' ? 'happy' : m.job === 'wheel' ? 'excited' :
      ['beans', 'crank', 'grinder', 'top', 'ladder'].includes(m.job) ? 'determined' : MOODS[Math.floor(m.h2 * MOODS.length)];
    const o = feel(mood, t + m.h * 2);
    o.emote = null; o.seed = m.h * 7; o.boilKey = 'm' + m.id;
    if (m.id < 4 && t < 5.2) { Object.assign(o, feel('happy', t + m.h)); o.emote = null; }
    if (m.job === 'sleep') o.emote = 'zzz';
    if (m.job === 'audience' && m.k === 2) o.emote = '?';
    if (m.job === 'audience' && m.k === 5) o.emote = 'dots';
    if (m.job === 'wheel') o.emote = 'sweat';
    // pose from the job
    Object.assign(o, { view: P.view || 'front', flip: !!P.flip });
    if (P.walk != null) o.walk = P.walk;
    if (P.aL != null) o.aL = P.aL; if (P.aR != null) o.aR = P.aR;
    if (P.rot) o.rot = (o.rot || 0) + P.rot;
    if (P.dx) o.dx = (o.dx || 0) + P.dx;
    if (P.run) { o.dy = (o.dy || 0) - Math.abs(Math.sin(P.walk * Math.PI)) * .6; o.rot = (o.rot || 0) + (o.flip ? .12 : -.12); }
    if (P.view === 'side' && P.walk != null) { o.dy = -Math.abs(Math.sin(P.walk * Math.PI)) * .5; o.lookX = 0; }
    if (P.climb) { o.aL = 1.2 + .3 * Math.sin(P.walk * Math.PI); o.aR = 1.2 - .3 * Math.sin(P.walk * Math.PI); o.dy = 0; o.walk = P.walk; }
    o.hat = P.hat || m.hat || null;
    if (P.sleep) { Object.assign(o, { rot: -Math.PI / 2 + .05, dy: -5, eyes: 'closed', mouth: 'o', aL: .2, aR: .2, view: 'front', walk: null, sq: 0 }); }
    const carry = P.carry || m.carry;
    if (carry === 'bean') { o.carryBean = true; if (o.view !== 'back') { o.aL = 1.45; o.aR = 1.45; } }
    if (P.pointer) o.armL2 = 'pointer';
    if (P.wrench) o.armR2 = 'wrench';
    // hopping out of the puff
    if (P.hop != null) { o.sq = -.2 * Math.sin(P.hop * Math.PI); o.aL = 1.2; o.aR = 1.2; o.eyes = 'wide'; o.mouth = 'o'; o.walk = null; }
    // silence: everyone stops and watches the cup go by
    if (t > tDing && t < tGo && !P.sleep) {
      const w = M[0] && posAt(0, t), tx = w ? w.x : MX;
      const blinkK = 1 - Math.abs(t - (tDing + .06 + .25 * m.h)) / .08;
      o.eyes = 'normal'; o.mouth = null; o.lookX = clamp((tx - st.x) / 300, -1, 1); o.lookY = t > tTake ? -.4 : 0;
      o.squint = Math.max(0, blinkK); o.emote = null; o.dy = 0; o.sq = 0; o.rot = P.rot || 0; o.aL = .1; o.aR = .1;
      if (o.view === 'side' || o.view === 'q') { o.view = 'front'; o.flip = false; o.walk = null; }
      if (m.job === 'ladder') { o.view = 'back'; }
      if (m.job === 'wheel') { o.view = 'side'; o.walk = 0; }
      if (m.job === 'audience') { o.view = st.x < -240 ? 'qback' : 'qback'; o.flip = false; }
      if (carry === 'bean') { o.aL = 1.45; o.aR = 1.45; }
      // the freeze: sugar?! eyes wide, a take
      if (t > tFreeze + .08 * m.h) {
        const tk = take(t, tFreeze + .08 * m.h, 1.2);
        o.eyes = 'wide'; o.mouth = 'O'; o.lookX = 0; o.lookY = -.2; o.sq = tk.sq; o.dy = tk.dy;
        o.emote = m.h3 < .18 ? '!' : m.h3 > .9 ? 'sweat' : null; o.emoteK = seg(t, tFreeze + .05, tFreeze + .2); o.emoteAge = t - tFreeze;
      }
    }
    if (t >= tGo && !P.sleep) {   // back to work, fast
      o.eyes = 'determined'; o.mouth = m.h > .5 ? 'teeth' : 'flat'; o.emote = null;
      if (o.view === 'side') { o.smear = .35; o.rot = (o.rot || 0) + (o.flip ? .15 : -.15); }
    }
    return { u, o };
  }

  // the walker (mini 0) after the ding: picks up the cup, carries it over, hands it up, gets it back, runs off
  function walker(t, st) {
    const u = 14;
    let x = st.x, y = OP[1];
    const o = { ...feel('determined', t), emote: null, boilKey: 'm0', seed: 3, view: 'side', flip: true };
    if (t < tPick) { o.aL = -.2 + .5 * Math.sin(t * 6); }
    else if (t < tWalk0) {   // bend, grab, lift
      const k = seg(t, tPick, tPick + .15), up = backOut(seg(t, tPick + .18, tWalk0 - .05));
      o.aL = lerp(lerp(.2, -.7, k), 1.15, up); o.sq = .15 * Math.sin(k * Math.PI);
      o.eyes = 'look'; o.mouth = null; o.lookX = 0;
    } else if (t < tWalk1) {   // the walk, held high, careful
      const d = (x - OP[0]) / (4 * u);
      o.walk = -d; o.dy = -Math.abs(Math.sin(d * Math.PI)) * .45; o.aL = 1.15 + .08 * Math.sin(d * TAU); o.rot = .03 * Math.sin(d * TAU);
      o.eyes = 'determined'; o.mouth = 'flat';
    } else if (t < tBack) {   // offer it up, hopeful; then watch
      const off = backOut(seg(t, tWalk1, tWalk1 + .25)), give = seg(t, tTake, tTake + .15);
      Object.assign(o, feel('hopeful', t), { view: 'side', flip: true, emote: null, boilKey: 'm0' });
      o.aL = lerp(lerp(1.15, 1.35, off), .1, give); o.sq = -.08 * off * (1 - give); o.lookY = -.9; o.lookX = 0;
      if (t > tFlat) { o.eyes = 'look'; o.mouth = 'o'; }
    } else if (t < tGo) {   // takes it back
      const k = ease(seg(t, tBack + .05, tBack + .22));
      o.eyes = t > tFreeze ? 'wide' : 'look'; o.mouth = t > tFreeze ? 'O' : null; o.lookY = -.9; o.aL = lerp(.1, 1.2, k);
      if (t > tFreeze) { const tk = take(t, tFreeze, 1.2); o.sq = tk.sq; o.dy = tk.dy; o.emote = '!'; o.emoteK = seg(t, tFreeze + .02, tFreeze + .15); o.emoteAge = t - tFreeze; }
    } else {   // runs back to the machine with it
      const k = t - tGo; x = ARRIVE + 1400 * easeIn(clamp(k / .5)) + k * 200;
      o.flip = false; o.walk = k * 6; o.dy = -Math.abs(Math.sin(k * 6 * Math.PI)) * .6; o.aL = 1.2; o.rot = -.15; o.smear = .4;
      o.eyes = 'determined'; o.mouth = 'teeth';
    }
    return { x, y, u, o };
  }

  // ---------- Clawd ----------
  EMO.deadpan = { eyes: 'narrow', mouth: 'flat', take: .15, body: t => { const br = Math.sin(t * TAU * .4); return { sq: .02 * br, aL: -.6, aR: -.6 }; } };
  function clawdPose(t) {
    const mood = emotions(t, [[0, 'neutral'], [tLook, 'surprised', { lookX: .8, lookY: -.8 }], [tDet, 'determined'], [tThink, 'thinking'], [tIdea, 'idea'],
      [3.3, 'happy', { lookX: .8 }], [4.02, 'surprised', { lookX: .9 }], [4.75, 'starstruck'], [6.7, 'proud'],
      [tDing + .05, 'surprised', { lookX: .9, emote: null }], [9.85, 'hopeful', { lookX: .8 }], [tTake + .05, 'happy', { lookX: .8 }],
      [tSip, 'relieved', { eyes: 'closed', mouth: 'o', emote: null }], [tFlat, 'deadpan']]);
    const o = { ...mood };
    // knuckle crack: arms up and together, two snaps
    if (t > tDet && t < tThink) {
      const up = ease(seg(t, tDet + .08, tCr1 - .06)), down = ease(seg(t, tCr2 + .12, tThink));
      const snap = Math.exp(-Math.max(0, t - tCr1) * 12) * (t > tCr1 ? 1 : 0) + Math.exp(-Math.max(0, t - tCr2) * 12) * (t > tCr2 ? 1 : 0);
      const arm = lerp(lerp(o.aL ?? .2, 1.25, up), -.4, down) - .35 * snap;
      o.aL = arm; o.aR = lerp(lerp(o.aR ?? .2, 1.25, up), -.4, down) - .35 * (t > tCr2 ? Math.exp(-(t - tCr2) * 12) : 0) - .2 * (t > tCr1 ? Math.exp(-(t - tCr1) * 12) : 0);
      o.sq = (o.sq || 0) + .08 * snap;
    }
    // point: spawn the first mini from the right arm
    if (t > tPoint - .12 && t < 3.5) { const k = backOut(seg(t, tPoint - .12, tPoint)), back = ease(seg(t, 3.2, 3.5)); o.aR = lerp(lerp(o.aR ?? .2, .12, k), o.aR ?? .2, back); o.sq = (o.sq || 0) + .1 * Math.sin(seg(t, tPoint - .12, tPoint + .15) * Math.PI); }
    // the sip: turn to the walker, step in, take the cup, sip, turn to us
    if (t > tTurn && t < tFlat + .1) {
      const step = ease(seg(t, tTurn, tTake)) * (1 - ease(seg(t, tSip1, tFlat)));
      o.dx = (o.dx || 0) + 2.2 * step;
      if (t < tSip1) Object.assign(o, turn(t, tTurn, tTurn + .16, 0, .25));
      else Object.assign(o, turn(t, tSip1, tSip1 + .16, .25, 0));
      if (o.view === 'side') {
        const reach = ease(seg(t, tTurn + .1, tTake)), lift = ease(seg(t, tTake + .12, tSip)), lower = ease(seg(t, tSip1 - .15, tSip1));
        o.aL = lerp(lerp(.2, -.05, reach), 1.25, lift * (1 - lower)); o.lookX = 0; o.lookY = .2;
        if (t > tSip - .05 && t < tSip1 - .1) { o.rot = (o.rot || 0) - .08; o.sq = (o.sq || 0) - .04; }
      }
    }
    if (t >= tFlat + .1) {   // deadpan, then hand it back with the near (right) arm
      const give = ease(seg(t, tBack - .05, tBack + .12)), done = ease(seg(t, tBack + .3, tBack + .5));
      o.aR = lerp(-.6, -.35, give * (1 - done));
    }
    return o;
  }

  // ---------- mini Clawds on a 2D ink layer ----------
  // The same design as clawd() (10u × 6u body, four legs, two nubs, slit eyes, the same views, eyes, mouths and
  // emotes the swarm uses), painted with flat colour and a wobbly double ink line that boils at BOIL fps.
  
  const MV = {
    front: { L: -5, R: 5, face: [0, 1, [-1, 1]], legs: [[-4, 0], [-2, 0], [1, 0], [3, 0]], arms: [[-4.9, -1, 'L', 0], [4.9, 1, 'R', 0]] },
    q:     { L: -5, R: 5.1, strip: [-5, -2.3], face: [1.5, .74, [-1, 1]], legs: [[-4.3, 1], [-1.8, 0], [.8, 0], [3.3, 0]], arms: [[5, 1, 'R', 2], [-4.7, -1, 'L', 1]] },
    side:  { L: -3.1, R: 3.1, face: [1.35, .55, [1]], legs: [[-2.1, 1], [1.3, 1], [-2.6, 0], [.9, 0]], arms: [[1.6, 0, 'L', 1]] },
    qback: { L: -5.1, R: 5, strip: [2.3, 5], face: null, legs: [[3.3, 1], [.8, 0], [-1.8, 0], [-4.3, 0]], arms: [[-5, -1, 'R', 2], [4.7, 1, 'L', 1]] },
    back:  { L: -5, R: 5, face: null, legs: [[-4, 0], [-2, 0], [1, 0], [3, 0]], arms: [[-4.9, -1, 'R', 0], [4.9, 1, 'L', 0]] },
  };
  function mini2d(g, x, y, u, o, key) {
    let s = 0; for (const c of key + '|' + BOILN) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
    const rn = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const J = u * .07, jj = () => (rn() * 2 - 1) * J;
    const V = MV[o.view] || MV.front, sq = o.sq || 0, sm = clamp(o.smear || 0);
    const col = o.col || tintCols(o).col, dk = o.dk || tintCols(o).dk, far = mixCol(dk, PAL.ink, .22);
    const lw = u * .24;
    const shape = (pts, fillC, ink = true, w = 1) => {
      g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a + jj() * .5, b + jj() * .5) : g.moveTo(a + jj() * .5, b + jj() * .5)); g.closePath();
      if (fillC) { g.fillStyle = fillC; g.fill(); }
      if (ink) { g.strokeStyle = PAL.ink; g.lineWidth = lw * w; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = .35; g.lineWidth = lw * w * 1.6; g.stroke(); g.globalAlpha = 1; }
    };
    const box = (x0, y0, w, h, fillC, ink = true, lwm = 1) => shape([[x0, y0], [x0 + w / 2, y0 + jj() * .4], [x0 + w, y0], [x0 + w, y0 + h], [x0 + w / 2, y0 + h + jj() * .4], [x0, y0 + h]], fillC, ink, lwm);
    const line = (pts, w, c = PAL.ink) => { g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a + jj() * .3, b + jj() * .3) : g.moveTo(a, b)); g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
    const ell = (cx, cy, rx, ry, fillC, ink = false) => { g.beginPath(); g.ellipse(cx, cy, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU); if (fillC) { g.fillStyle = fillC; g.fill(); } if (ink) { g.strokeStyle = PAL.ink; g.lineWidth = lw * .7; g.stroke(); } };

    if (!o.noShadow && !o.rot) { g.globalAlpha = .22; ell(x + (o.dx || 0) * u, y + u * .15, u * 5.2 * (V.R - V.L) / 10, u * .9, PAL.ink); g.globalAlpha = 1; }
    if (sm > .05) { const d = o.flip ? 1 : -1; g.globalAlpha = .5; for (let i = 0; i < 3; i++) line([[x + d * 3 * u, y + (o.dy || 0) * u - (6.5 - i * 1.6) * u], [x + d * (6 + 2 * hash(i)) * u * sm, y + (o.dy || 0) * u - (6.5 - i * 1.6) * u]], lw * .8, col); g.globalAlpha = 1; }
    g.save();
    g.translate(x + (o.dx || 0) * u, y + (o.dy || 0) * u);
    if (o.rot) g.rotate(o.rot);
    g.scale((o.flip ? -1 : 1) * (1 + sq * .6) * (1 + sm * .35), 1 - sq);
    const HK = h => { if (h === 'pointer') line([[0, 0], [4.5 * u, 0]], lw * .8, C.woodDk); if (h === 'wrench') { box(0, -.25 * u, 2.4 * u, .5 * u, C.metal, true, .6); ell(2.6 * u, 0, .6 * u, .6 * u, C.metal, true); } };
    const arm = ([px, dir, which, layer]) => {
      const a = which === 'L' ? (o.aL ?? .2) : (o.aR ?? .2), hook = which === 'L' ? o.armL2 : o.armR2;
      g.save(); g.translate((px + dir * .55 * clamp((Math.abs(a) - .7) / .9)) * u, -4.5 * u);
      const c = layer === 2 ? mixCol(col, dk, .4) : col;
      if (dir === 0) { g.translate(0, .3 * u); g.rotate(.7 - a); box(-.2 * u, -.45 * u, 2.3 * u, .9 * u, c, true, .8); if (hook) { g.translate(2.1 * u, 0); HK(hook); } }
      else { g.rotate(dir < 0 ? a : -a); box(dir < 0 ? -2.2 * u : 0, -.5 * u, 2.2 * u, u, c, true, .8); if (hook) { g.translate(dir * 2.2 * u, 0); if (dir < 0) g.scale(-1, 1); HK(hook); } }
      g.restore();
    };
    V.arms.filter(a => a[3] !== 1).forEach(arm);
    V.legs.forEach(([lx, isFar], i) => {
      let h = 2.2, sx = 0;
      if (o.walk != null) {
        if (o.view === 'side') { const ph = (o.walk + [0, .5, .5, 0][i]) * TAU; sx = Math.sin(ph) * .55; h = 2.2 - Math.max(0, Math.cos(ph)) * .8; }
        else { const ph = Math.sin((o.walk + (i % 2 ? .5 : 0)) * TAU); if (ph > 0) h = 2.2 - ph * .9; }
      }
      box((lx + sx) * u, -2.4 * u, u, h * u, isFar ? far : dk, true, .8);
    });
    const L = V.L * u, R = V.R * u;
    box(L, -8 * u, R - L, 6 * u, col, false);
    g.globalAlpha = .45; box(L + .2 * u, -3.7 * u, R - L - .4 * u, 1.5 * u, dk, false); g.globalAlpha = 1;
    if (V.strip) { g.globalAlpha = .6; box(V.strip[0] * u, -8 * u, (V.strip[1] - V.strip[0]) * u, 6 * u, dk, false); g.globalAlpha = 1; }
    box(L, -8 * u, R - L, 6 * u, null, true);
    if (V.face) {
      const [fcx, fw, sides] = V.face;
      g.save(); g.translate(fcx * u, 0); g.scale(fw, 1);
      const sqz = clamp(o.squint || 0), lx = (o.lookX || 0) * u * .5, ly = (o.lookY || 0) * u * .4, e = o.eyes || 'normal';
      const blink = ['normal', 'look', 'wide'].includes(e) && ((T * .9 + (o.seed || 0) * 1.7) % 3.3) < .12;
      for (const sd of sides) {
        const ex = sd * 2.5 * u, ey = -6 * u;
        if (sqz > .6 || blink || e === 'closed' || e === 'sleepy') { line([[ex - .7 * u, ey + .3 * u], [ex, ey + .6 * u], [ex + .7 * u, ey + .3 * u]], lw); continue; }
        if (e === 'happy' || e === 'squeeze') { line([[ex - .8 * u, ey + .6 * u], [ex, ey - .4 * u], [ex + .8 * u, ey + .6 * u]], lw * 1.1); continue; }
        const [w, h] = e === 'wide' || e === 'scared' || e === 'spark' ? [1.25, 2.7] : e === 'narrow' ? [1.2, .7] : [1, 2];
        const hh = h * (1 - sqz);
        if (e === 'determined' || e === 'angry') shape([[ex - .65 * u + lx, ey + (sd < 0 ? -.55 : -.05) * u], [ex + .65 * u + lx, ey + (sd < 0 ? -.05 : -.55) * u], [ex + .65 * u + lx, ey + u], [ex - .65 * u + lx, ey + u]], PAL.ink, false);
        else box(ex - w / 2 * u + lx, ey - hh / 2 * u + ly, w * u, hh * u, PAL.ink, false);
        if (u > 9 && e !== 'narrow') ell(ex + lx - w * .18 * u, ey + ly - hh * .29 * u, u * .17 * w, u * .22 * w, PAL.cream);
      }
      const m = o.mouth, my = -4.3 * u, mx = (V === MV.side ? 1.7 : 0) * u;
      if (m === 'O' || m === 'open' || m === 'laugh' || m === 'wail') ell(mx, my + .2 * u, .7 * u, .8 * u, '#4A1F2A', true);
      else if (m === 'o' || m === 'yawn') ell(mx, my, .4 * u, .45 * u, PAL.ink);
      else if (m === 'teeth' || m === 'grin') { box(mx - 1.2 * u, my - .5 * u, 2.4 * u, .9 * u, PAL.cream, true, .6); line([[mx - 1.1 * u, my - .05 * u], [mx + 1.1 * u, my - .05 * u]], lw * .4); }
      else if (m === 'flat') line([[mx - .7 * u, my - .1 * u], [mx + .7 * u, my - .1 * u]], lw * .8);
      else if (m) line([[mx - .8 * u, my - .3 * u], [mx, my + .2 * u], [mx + .8 * u, my - .3 * u]], lw * .8);
      g.restore();
    }
    if (o.hat === 'hard') {
      const hx = (V === MV.side ? .3 : V === MV.q ? .6 : 0) * u, hw = V === MV.side ? .66 : 1;
      g.save(); g.translate(hx, 0); g.scale(hw, 1);
      const d = []; for (let i = 0; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI; d.push([Math.cos(a) * 3.5 * u, -8 * u + Math.sin(a) * 3.1 * u]); }
      shape(d, '#F2C53D', true, .8); box(-4.9 * u, -8.6 * u, 9.8 * u, .9 * u, '#F2C53D', true, .8);
      g.restore();
    }
    V.arms.filter(a => a[3] === 1).forEach(arm);
    if (o.carryBean) { const bx = V === MV.side ? .6 * u : 0; ell(bx, -9.1 * u, 1.25 * u, .9 * u, C.bean, true); line([[bx - .7 * u, -9.2 * u], [bx, -9 * u], [bx + .7 * u, -9.2 * u]], lw * .4, C.beanLt); }
    g.restore();
    // emotes, by the head
    if (o.emote && (o.emoteK ?? 1) > .05) {
      const k = backOut(o.emoteK ?? 1), dir = o.flip ? -1 : 1, age = o.emoteAge ?? T;
      const ex = x + dir * (V.R + .6) * u, ey = y + (o.dy || 0) * u - 8.8 * u;
      g.save(); g.translate(ex, ey); g.scale(k, k);
      const s2 = u * .9;
      if (o.emote === '!') { shape([[-.6 * s2, -2.3 * s2], [.6 * s2, -2.3 * s2], [.2 * s2, .4 * s2], [-.2 * s2, .4 * s2]], PAL.ochre, true, .8); ell(0, 1.25 * s2, .42 * s2, .42 * s2, PAL.ochre, true); }
      else if (o.emote === '?') { line([[-1 * s2, -1.3 * s2], [-.5 * s2, -2.2 * s2], [.4 * s2, -2.3 * s2], [1 * s2, -1.6 * s2], [.7 * s2, -.8 * s2], [0, -.3 * s2], [0, .3 * s2]], s2 * .75, PAL.ink); line([[-1 * s2, -1.3 * s2], [-.5 * s2, -2.2 * s2], [.4 * s2, -2.3 * s2], [1 * s2, -1.6 * s2], [.7 * s2, -.8 * s2], [0, -.3 * s2], [0, .3 * s2]], s2 * .45, PAL.sky); ell(0, 1.25 * s2, .42 * s2, .42 * s2, PAL.sky, true); }
      else if (o.emote === 'sweat') { const dy = (age * 1.5 % 1) * s2; shape([[0, -1.6 * s2 + dy], [.9 * s2, .2 * s2 + dy], [0, .9 * s2 + dy], [-.9 * s2, .2 * s2 + dy]], PAL.sky, true, .6); }
      else if (o.emote === 'dots') for (let i = 0; i < 3; i++) { const q = backOut(clamp((frac(age / 1.8) - i * .22) * 6)); if (q > .02) ell((i - 1) * 1.3 * s2, 0, .42 * s2 * q, .42 * s2 * q, PAL.ink); }
      else if (o.emote === 'zzz') for (let i = 0; i < 3; i++) {
        const ph = frac(age * .4 + i / 3), a = Math.sin(ph * Math.PI), zs = (.8 + ph * .7) * s2 * Math.min(1, a * 1.6); if (a < .12) continue;
        const zx = ph * 2.6 * s2 - 4 * s2, zy = -ph * 4.2 * s2 + 3 * s2;
        line([[zx - .6 * zs, zy - .6 * zs], [zx + .6 * zs, zy - .6 * zs], [zx - .6 * zs, zy + .6 * zs], [zx + .6 * zs, zy + .6 * zs]], s2 * .5, PAL.ink);
        line([[zx - .6 * zs, zy - .6 * zs], [zx + .6 * zs, zy - .6 * zs], [zx - .6 * zs, zy + .6 * zs], [zx + .6 * zs, zy + .6 * zs]], s2 * .28, PAL.cream);
      }
      g.restore();
    }
  }
  function puff2d(g, x, y, r, k, key) {
    if (k <= 0 || k >= 1) return;
    const R = r * (.4 + .9 * easeOut(k));
    g.beginPath();
    for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, b = 1 + .3 * Math.abs(Math.sin(a * 3 + key)); const px = x + Math.cos(a) * R * b, py = y + Math.sin(a) * R * .75 * b; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.closePath(); g.globalAlpha = 1 - k * k; g.fillStyle = PAL.cream; g.fill();
    if (k < .6) { g.strokeStyle = PAL.ink; g.lineWidth = r * .07; g.lineJoin = 'round'; g.stroke(); }
    if (k < .5) for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + key, d = R * (1.2 + .6 * k);
      g.beginPath(); g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * .75); g.lineTo(x + Math.cos(a) * (d + r * .35), y + Math.sin(a) * (d + r * .35) * .75); g.lineWidth = r * .06; g.stroke();
    }
    g.globalAlpha = 1;
  }

  // ---------- the film ----------
  function film(t, lt, dur) {
    const [cx, cy, z] = camAt(t);
    const shake = (t > tFreeze && t < tFreeze + .3) ? shakeXY(t, 6 * Math.exp(-(t - tFreeze) * 12)) : [0, 0];
    camBegin(cx + shake[0], cy + shake[1], z);
    layer2(() => { room(t); whiteboard(t); machine(t); sack(t); sugar(322, 1340, 30, 'pillow'); });
    note(t, 1400, 330);

    // Everything that stands on the desk, back to front. The minis go on a plain 2D ink layer (mini2d): with hundreds
    // of them, p5.brush's per-colour compositing costs seconds a frame on a software GPU. Minis behind Clawd are
    // composited before Clawd is painted, the ones in front after.
    const cl = clawdPose(t);
    let W = null;
    const back = [], front = [];
    for (let i = 0; i < M.length; i++) {
      const st = posAt(i, t); if (!st) continue;
      if (i === 0 && t >= tPick) { W = walker(t, st); front.push([W.y + .5, W.x, W.y, W.u, W.o, 0]); continue; }
      const m = M[i]; const { u, o } = miniOpts(m, st, t);
      const grow = st.pose.hop != null ? backOut(seg(t, ts(i), ts(i) + .22)) : 1;
      let sx = st.x;
      if (t >= tGo && m.job !== 'sleep' && m.job !== 'audience') {   // scramble: everyone rushes back out
        const k = t - tGo, dir = st.x > MX ? 1 : -1;
        if (m.job === 'wander' || i < 4) { o.view = 'side'; o.flip = dir < 0; o.walk = k * 7 + m.h * 3; sx += dir * 900 * easeIn(clamp(k / .6)) * (.5 + m.h); }
      }
      const sy = st.pose.sortY || st.y;
      (sy < GY ? back : front).push([sy, sx, st.y, u * grow, o, i]);
    }
    const layer = (list, slot, extra) => layer2(g => {
      list.sort((a, b) => a[0] - b[0]);
      for (const [, x, y, u, o, id] of list) if (u > .5) mini2d(g, x, y, u, o, 'm' + id);
      if (extra) extra(g);
    }, false, slot);
    layer(back, 'back');
    clawd(MX, GY, MU, { ...cl, boilKey: 'main' });
    layer(front, 'front', g => {   // puffs where minis pop out
      for (let i = 0; i < M.length; i++) {
        const t0 = ts(i), k = seg(t, t0, t0 + .38); if (k <= 0 || k >= 1) continue;
        const pi = parentOf(i), src = pi < 0 ? armTip(MX, GY, MU, cl, 'R') : (() => { const p = posAt(pi, t0); return p ? [p.x, p.y - 6 * uAt(p.y)] : [MX, GY]; })();
        puff2d(g, src[0], src[1], i < 4 ? 70 : 34 + 30 * hash(i), k, i);
      }
    });

    // knuckle cracks at the arm tips
    for (const [tc, w] of [[tCr1, 'L'], [tCr1 + .03, 'R'], [tCr2, 'R'], [tCr2 + .03, 'L']]) {
      if (t > tc && t < tc + .3) { const p = armTip(MX, GY, MU, cl, w); crackMark(p[0], p[1], 34, seg(t, tc, tc + .3), tc + w); }
    }
    // the cup in hand
    if (W) {
      const wt = armTip(W.x, W.y, W.u, W.o, 'L');
      const side = cl.view === 'side', ct = armTip(MX, GY, MU, cl, side ? 'L' : 'R');
      let p = [wt[0], wt[1] - 14], tilt = 0, steam = 1;
      if (t < tWalk0 && t < tPick + .15) { const k = seg(t, tPick, tPick + .15); p = [lerp(SPX, wt[0], k), lerp(CUPY, wt[1] - 14, k)]; }
      if (t > tTake && t < tBack + .1) {
        const k = ease(seg(t, tTake, tTake + .18));
        const cp = side ? [ct[0] + 6, ct[1] - 12] : [ct[0] + 4, ct[1] - 14];
        p = [lerp(p[0], cp[0], k), lerp(p[1], cp[1], k)];
        const sipK = ease(seg(t, tSip - .12, tSip + .02)) * (1 - ease(seg(t, tSip1 - .2, tSip1 - .05)));
        if (sipK > 0) {   // the cup comes right up to the mouth and tips
          const mx = MX + (cl.dx || 0) * MU + 2.6 * MU, my = GY + (cl.dy || 0) * MU - 4.6 * MU * (1 - (cl.sq || 0));
          p = [lerp(p[0], mx + 16, sipK), lerp(p[1], my - 6, sipK)]; tilt = -.75 * sipK; steam = 1 - .7 * sipK;
        }
      }
      if (t >= tBack + .1) {
        const k = ease(seg(t, tBack + .1, tBack + .25)), cp = [ct[0] + 4, ct[1] - 14];
        p = [lerp(cp[0], wt[0], k), lerp(cp[1], wt[1] - 14, k)];
      }
      boilSeed('cup');
      cup(p[0], p[1], 34, { level: t > tSip1 ? .75 : 1, steam, tilt, key: 'held' });
    }
    // Clawd's thought: sugar
    if (t > tBubble) bubble(t, MX + 300, GY - 420);
    camEnd();
    boilSeed('transition');
    if (lt < .3) wipe2(.5 + lt / .6, [C.deskDk, C.desk]);
    if (t > tWipe) wipe2(seg(t, tWipe, dur) * .5, [C.deskDk, C.desk]);
  }

  shots([[0, film]]);
})();
