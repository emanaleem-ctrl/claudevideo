(() => {
  const L = (name, f) => { LOOPS[name] = f; LOOPS[name].len = 1; };
  L('empty', t => {});
  L('bg', t => { boilSeed('bg'); paint(rectPts(-60, -60, W + 120, H + 120), { wash: PAL.cream, ink: null }); });
  L('wash100', t => { for (let i = 0; i < 100; i++) { boilSeed('w'+i); paint(rectPts(hash(i)*1800, hash(i+9)*1000, 40, 30, 2), { wash: PAL.clay, ink: null }); } });
  L('ink100', t => { for (let i = 0; i < 100; i++) { boilSeed('w'+i); paint(rectPts(hash(i)*1800, hash(i+9)*1000, 40, 30, 2), { ink: PAL.ink, sw: .6 }); } });
  L('line100', t => { for (let i = 0; i < 100; i++) { boilSeed('w'+i); const x=hash(i)*1800,y=hash(i+9)*1000; inkLine([[x,y],[x+30,y+5]], .6, PAL.ink, 'inkfine', 0); } });
  L('fill10', t => { for (let i = 0; i < 10; i++) { boilSeed('w'+i); paint(ellPts(hash(i)*1800, hash(i+9)*1000, 60, 40, 16), { fill: PAL.sap, fillOp: 120, ink: null }); } });
  L('bigfill', t => { boilSeed('b'); paint(ellPts(960, 540, 900, 500, 30), { fill: PAL.sap, fillOp: 120, bleed:.2, ink: null }); });
  L('clawd10', t => { for (let i = 0; i < 10; i++) clawd(100 + i * 180, 600, 10, feel('happy', t)); });
  L('clawd1big', t => { clawd(960, 900, 26, feel('happy', t)); });
})();
(() => {
  const L = (name, f) => { LOOPS[name] = f; LOOPS[name].len = 1; };
  L('washop100', t => { for (let i = 0; i < 100; i++) { boilSeed('w'+i); paint(rectPts(hash(i)*1800, hash(i+9)*1000, 40, 30, 2), { wash: PAL.clay, washOp: 120, ink: null }); } });
  L('fill1', t => { boilSeed('b'); paint(ellPts(960, 540, 60, 40, 16), { fill: PAL.sap, fillOp: 120, ink: null }); });
  L('fillwash5', t => { for (let i = 0; i < 5; i++) { boilSeed('w'+i); paint(ellPts(hash(i)*1800, hash(i+9)*1000, 60, 40, 16), { fill: PAL.sap, fillOp: 120, ink: null }); paint(rectPts(hash(i)*1800, hash(i+9)*1000, 40, 30, 2), { wash: PAL.clay, ink: PAL.ink }); } });
  L('clawdlite10', t => { window.LITE = true; for (let i = 0; i < 10; i++) clawd(100 + i * 180, 600, 10, feel('happy', t)); window.LITE = false; });
})();
