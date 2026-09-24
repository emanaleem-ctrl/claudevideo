// sound.mjs: synthesizes the soundtrack for infinite.js in code (no samples) → assets/sfx.wav
//   node sound.mjs            (reads the spawn times from swarm.json, written by: node sound.mjs --dump)
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';

const SR = 44100, DUR = 22, N = SR * DUR, out = new Float32Array(N);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const noise = () => rnd() * 2 - 1;
const at = t => Math.round(t * SR), TAU23 = 2 * Math.PI * 23;

// RBJ biquad
function biquad(type, f, q = .7) {
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }   // band-pass
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function add(t0, len, fn, gain = 1) { const i0 = at(t0); for (let i = 0; i < at(len); i++) { const j = i0 + i; if (j >= 0 && j < N) out[j] += gain * fn(i / SR); } }

// a bubbly pop: a fast upward pitch sweep with a click
function pop(t, f = 500, g = .5) {
  let ph = 0; const hp = biquad('hp', 1500);
  add(t, .09, x => { const f1 = f * (1 + 2.2 * Math.min(1, x / .04)); ph += 2 * Math.PI * f1 / SR; return Math.sin(ph) * Math.exp(-x * 45) + .4 * hp(noise()) * Math.exp(-x * 400); }, g);
}
function crack(t, g = .5) { for (let k = 0; k < 3; k++) { const hp = biquad('hp', 2500); add(t + k * .018 + .004 * rnd(), .012, x => hp(noise()) * Math.exp(-x * 500), g * (1 - k * .2)); } }
function ding(t, f = 1320, g = .35, d = 2.2) { add(t, 1.6, x => (Math.sin(2 * Math.PI * f * x) + .5 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 4) + .25 * Math.sin(2 * Math.PI * f * 5.4 * x) * Math.exp(-x * 8)) * Math.exp(-x * d) * Math.min(1, x * 400), g); }
function tick(t, g = .12, f = 3000) { const bp = biquad('bp', f, 3); add(t, .03, x => bp(noise()) * Math.exp(-x * 220), g); }
function thump(t, g = .5) { let ph = 0; add(t, .25, x => { ph += 2 * Math.PI * (60 + 90 * Math.exp(-x * 30)) / SR; return Math.sin(ph) * Math.exp(-x * 14); }, g); }
function whoosh(t, len, g = .35, f0 = 300, f1 = 2400) {
  const bp1 = biquad('bp', 800, 1), lp = biquad('lp', 5000);
  let bp = bp1;
  add(t, len, x => { const k = x / len; if (Math.floor(x * SR) % 64 === 0) bp = biquad('bp', f0 * Math.pow(f1 / f0, k), 1.2); return lp(bp(noise())) * Math.sin(Math.PI * k) ** 1.5; }, g);
}
function slurp(t, len = .42, g = .5) {
  let bp = biquad('bp', 500, 4);
  add(t, len, x => { const k = x / len; if (Math.floor(x * SR) % 32 === 0) bp = biquad('bp', 400 + 1400 * k * k, 5); const am = .6 + .4 * Math.sin(2 * Math.PI * 28 * x) * Math.sin(2 * Math.PI * 7 * x); return bp(noise()) * am * Math.sin(Math.PI * k); }, g);
}
// the swarm working: tiny footsteps, the machine clunking on the beat, the grinder ratchet, a murmur
function bustle(t0, t1, dens, g = 1) {
  for (let t = t0; t < t1; t += 1 / dens) tick(t + rnd() / dens, .05 + .05 * rnd(), 1800 + 3000 * rnd());
  for (let t = Math.ceil(t0 * 2) / 2; t < t1; t += .5) { thump(t, .28 * g); tick(t + .25, .12 * g, 900); }
  for (let t = t0; t < t1; t += 1 / 11) tick(t, .06 * g, 5200);
  const lp = biquad('lp', 500);
  add(t0, t1 - t0, x => lp(noise()) * (.5 + .5 * Math.sin(x * 9)) * Math.min(1, x * 3, (t1 - t0 - x) * 30), .25 * g);
}

// ---------- the score ----------
const T = { note: .35, cr1: 1.38, cr2: 1.62, idea: 2.62, casc: 4.35, fill: 7.2, ding: 9.4, pick: 9.55, walk0: 9.95, walk1: 11.85,
            take: 12.28, sip: 12.5, bubble: 13.68, back: 13.6, freeze: 14.0, go: 14.3, wipe: 14.65 };
const swarm = JSON.parse(readFileSync('assets/swarm.json', 'utf8'));
whoosh(-.3, .6, .3);                          // the loop seam: the wipe drags off
pop(T.note, 620, .45);                        // the note
crack(T.cr1, .55); crack(T.cr2, .6);          // knuckles
ding(T.idea, 1568, .18, 5);                   // idea
// spawns: the first four clearly, then a snowball of pops
swarm.ts.forEach((t, i) => { if (i < 4) pop(t, [480, 560, 640, 700][i], .55); else pop(t, 380 + 700 * rnd(), Math.max(.06, .3 - i * .0012)); });
bustle(5.6, T.ding, 70, 1.8);
add(4.8, .8, x => 0, 0);
ding(T.ding, 1760, .45, 1.6);                 // the cup is full: DING, then silence
ding(T.ding, 2637, .15, 2.4);
for (let t = T.walk0 + .05, k = 0; t < T.walk1; t += .19, k++) tick(t, .45, 1400 + 200 * (k % 2));   // tiny footsteps
slurp(T.sip + .02, .42, 3.5);
pop(T.bubble, 700, .4); ding(T.bubble + .12, 2093, .12, 4);   // sugar?
thump(T.freeze, .8); ding(T.freeze, 220, .12, 6);             // freeze
whoosh(T.go - .05, .35, .35, 600, 3000);
bustle(T.go, 15, 90, 1.2);                    // back to work
whoosh(T.wipe, .38, .35);

// ---------- that night (15-22 s) ----------
const NT = { take: 1.4, chug: 1.65, chug1: 2.2, toss: 2.3, clink: 2.6, adv: 2.75, twitch: 3.5, pull: 4.4, note: 5.9, fade: 6.55 }, N0 = 15;
whoosh(N0 - .02, .35, .3, 2400, 300);                                      // the wipe drags off
for (let t = N0 + .2; t < 21.9; t += .47 + .2 * rnd()) for (let k = 0; k < 3; k++) tick(t + k * .045, .05, 4600);   // crickets
{ let ph = 0; const lp = biquad('lp', 900);                                 // Clawd's caffeine buzz, louder after the chug
  add(N0, 6.9, x => { ph += 2 * Math.PI * (140 + 6 * Math.sin(x * 50)) / SR; const k = 1 + 1.6 * Math.min(1, Math.max(0, (x - NT.chug1) / .6)); return lp(Math.sign(Math.sin(ph))) * (.5 + .5 * Math.sin(x * TAU23)) * .06 * k * Math.min(1, x * 3, (6.9 - x) * 2); }, 1); }
pop(N0 + NT.take, 520, .35);                                               // snatch
for (let k = 0; k < 4; k++) { const bp = biquad('bp', 260 + 40 * k, 6); add(N0 + NT.chug + k * .13, .1, x => bp(noise()) * Math.sin(Math.PI * x / .1), 3); }   // glug glug
ding(N0 + NT.clink, 2900, .25, 9); ding(N0 + NT.clink + .06, 3400, .15, 12);   // clink onto the tower
for (let k = 0; k < 14; k++) tick(N0 + NT.adv + k * .035 + .02 * rnd(), .2, 1200 + 400 * rnd());   // the queue shuffles up
tick(N0 + NT.twitch, .35, 6000); tick(N0 + NT.twitch + .4, .35, 6000);      // eye twitch
whoosh(N0 + NT.pull, .9, .25, 1800, 400);                                   // pull back
pop(N0 + NT.note, 620, .5);                                                 // tomorrow's note


for (let i = at(21.55); i < N; i++) out[i] *= Math.max(0, 1 - (i - at(21.55)) / (N - at(21.55)));
// fade in/out a few ms, normalize, write 16-bit WAV
let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(out[i]));
const g = .89 / pk, buf = Buffer.alloc(44 + N * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
mkdirSync('assets', { recursive: true }); writeFileSync('assets/sfx.wav', buf);
console.log('wrote assets/sfx.wav', (pk).toFixed(2));
