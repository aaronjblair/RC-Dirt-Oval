import { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

/** PBR dirt material from the bundled CC0 photo set (albedo + normal + AO).
 *  NOTE: no detailMap here — it was tried and reverted. Babylon's detail-map packs normal-X in
 *  the ALPHA channel (canvas alpha = opaque = max deflection) and expects a LINEAR texture, so a
 *  canvas noise detail layer silently DARKENED every dirt surface and could deadlock
 *  scene.executeWhenReady when cloned. The photo normal + baked grit carry the close-up look. */
export function makeDirtPBR(scene: Scene, name: string, uScale: number, vScale: number, tint: Color3): PBRMaterial {
  const base = import.meta.env.BASE_URL + "textures/dirt/"; // base-relative so it works under a Pages subpath
  const mk = (file: string) => {
    const t = new Texture(base + file, scene);
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = uScale; t.vScale = vScale;
    t.anisotropicFilteringLevel = 16; // kill grazing-angle moiré on the dirt
    return t;
  };
  const m = new PBRMaterial(name, scene);
  m.albedoTexture = mk("color.jpg");
  m.albedoColor = tint; // tints the pale photo toward clay
  m.bumpTexture = mk("normal.jpg");
  m.bumpTexture.level = 0.85; // relief without grazing-angle normal-map sparkle
  m.ambientTexture = mk("ao.jpg");
  m.metallic = 0;
  m.roughness = 0.95;
  return m;
}

/**
 * Procedural, tileable dirt textures drawn on a canvas — no external assets.
 * Returns an albedo (color + speckle) and a fine bump for surface micro-relief.
 */
/** Soft round particle sprite (white core fading to transparent) for dust.
 *  Kept opaque-reading (BLENDMODE_STANDARD) with a soft, natural falloff — a
 *  puff of kicked-up dirt, not a glowing additive ember. */
export function makeDustTexture(scene: Scene): DynamicTexture {
  const S = 128; // a touch more resolution for a smoother, less stair-stepped edge
  const t = new DynamicTexture("dust", { width: S, height: S }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const c = S / 2;
  // Soft round core with a gentle, gamma-shaped falloff (squared steps) so the
  // edge feathers out naturally instead of a hard ramp.
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, "rgba(255,255,255,0.92)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(0.62, "rgba(255,255,255,0.22)");
  g.addColorStop(0.82, "rgba(255,255,255,0.06)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Faint internal cloudiness so a billowing puff doesn't look like a perfect
  // disc — small soft blobs nudged toward the center where alpha is high.
  ctx.globalCompositeOperation = "source-atop"; // only paint where the core already has alpha
  for (let i = 0; i < 26; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * c * 0.6;
    const x = c + Math.cos(ang) * rad, y = c + Math.sin(ang) * rad;
    const r = c * (0.12 + Math.random() * 0.22);
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + Math.random() * 0.08;
    const lift = Math.random() < 0.5 ? 255 : 210; // some lighter, some shadowed
    blob.addColorStop(0, `rgba(${lift},${lift},${lift},${a})`);
    blob.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.globalCompositeOperation = "source-over";
  t.hasAlpha = true;
  t.update();
  return t;
}

/** Procedural REAL-looking mowed turf for the infield: a green base with broad mow-tone patches,
 *  dense multi-shade blade speckle, and a few dry/bare spots — drawn seam-mirrored so it tiles.
 *  Looks like real grass from above (not a flat green fill). */
export function makeGrassTexture(scene: Scene, tile = 18): DynamicTexture {
  const S = 512;
  const t = new DynamicTexture("grass", { width: S, height: S }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const wrap = (x: number, y: number, draw: (px: number, py: number) => void) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) draw(x + dx * S, y + dy * S);
  };
  ctx.fillStyle = "#3f7b2c"; // base mowed green — bright enough to still read GREEN under ACES + scene haze
  ctx.fillRect(0, 0, S, S);
  // broad mow-tone patches (lighter cut areas / darker shaded clumps)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 24 + Math.random() * 70;
    const lighter = Math.random() < 0.5;
    wrap(x, y, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, lighter ? "rgba(112,160,62,0.16)" : "rgba(32,64,20,0.18)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  // dense blade speckle in several green shades (short varied-angle dashes)
  const shades = ["#4d8a31", "#63a63e", "#33611f", "#74b84a", "#457f2d"];
  ctx.lineWidth = 1;
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = 2 + Math.random() * 4, ang = Math.random() * Math.PI;
    ctx.strokeStyle = shades[(Math.random() * shades.length) | 0];
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
  }
  // a few small dry/bare patches for realism
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 10;
    wrap(x, y, (px, py) => { ctx.fillStyle = "rgba(96,82,52,0.22)"; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); });
  }
  t.update();
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.uScale = tile; t.vScale = tile;
  t.anisotropicFilteringLevel = 16;
  return t;
}

export function makeDirtTextures(scene: Scene, tile = 40): { albedo: DynamicTexture; bump: DynamicTexture } {
  const S = 1024; // higher res buys finer grain + scuffs without obvious repeat (still one canvas pair)

  // Wrap-around helper: draw a sprite, mirroring it across the seams so the
  // tile stays seamless under WRAP addressing (no visible grid edge).
  const wrapDraw = (_ctx: CanvasRenderingContext2D, x: number, y: number, draw: (px: number, py: number) => void) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) draw(x + dx * S, y + dy * S);
  };

  // --- albedo ---
  const albedo = new DynamicTexture("dirtAlbedo", { width: S, height: S }, scene, true);
  const a = albedo.getContext() as CanvasRenderingContext2D;
  // base packed brown
  a.fillStyle = "#5a3d27";
  a.fillRect(0, 0, S, S);

  // Multi-scale tonal variation — large damp/dry patches down to mid clumps.
  // Bigger, fewer, softer blooms read as natural surface mottling, not blotches.
  const tonal = (count: number, rMin: number, rMax: number, alpha: number) => {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = rMin + Math.random() * (rMax - rMin);
      const shade = 0.62 + Math.random() * 0.6;
      // occasional cool, slightly darker "moisture" patch vs warm dry clay
      const damp = Math.random() < 0.32;
      const cr = (damp ? 70 : 96) * shade | 0;
      const cg = (damp ? 50 : 64) * shade | 0;
      const cb = (damp ? 38 : 40) * shade | 0;
      wrapDraw(a, x, y, (px, py) => {
        const g = a.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        a.fillStyle = g;
        a.fillRect(0, 0, S, S);
      });
    }
  };
  tonal(24, 180, 360, 0.30); // broad damp/dry sweeps
  tonal(70, 60, 160, 0.34);  // mid mottling
  tonal(140, 18, 60, 0.30);  // small clumps

  // Faint moisture-sheen highlights — a few brighter, low-alpha lifts so the
  // surface reads as packed (not powder) where light would glance off it.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 30 + Math.random() * 90;
    wrapDraw(a, x, y, (px, py) => {
      const g = a.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(150,128,98,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      a.fillStyle = g;
      a.fillRect(0, 0, S, S);
    });
  }

  // Tire-scuff / scrape streaks — short, faint, varied-angle smears (cars laying
  // rubber/dirt). Kept low-contrast so the surface stays a uniform brown overall.
  a.lineCap = "round";
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const ang = Math.random() * Math.PI * 2;
    const len = 30 + Math.random() * 160;
    const dark = Math.random() < 0.5;
    a.strokeStyle = dark
      ? `rgba(36,24,16,${0.05 + Math.random() * 0.10})`
      : `rgba(120,92,64,${0.04 + Math.random() * 0.08})`;
    a.lineWidth = 1 + Math.random() * 3;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    wrapDraw(a, 0, 0, (ox, oy) => {
      a.beginPath();
      a.moveTo(x + ox, y + oy);
      a.lineTo(ex + ox, ey + oy);
      a.stroke();
    });
  }

  // Fine grain speckle — packed-dirt grit at the smallest scale.
  for (let i = 0; i < 55000; i++) {
    const x = Math.random() * S, y = Math.random() * S, s = Math.random() * 2.2;
    const v = Math.random();
    const c = v < 0.5 ? [40, 27, 17] : v < 0.85 ? [110, 80, 55] : [150, 120, 90];
    a.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.35 + Math.random() * 0.4})`;
    a.fillRect(x, y, s, s);
  }

  // Embedded pebbles / clods — small lit-side / shadow-side blobs so they read
  // as little stones pressed into the surface (gives the bump something to back).
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 1.5 + Math.random() * 4.5;
    const pale = Math.random() < 0.6;
    const base = pale ? [150, 124, 92] : [80, 58, 40];
    wrapDraw(a, x, y, (px, py) => {
      // body
      a.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${0.55 + Math.random() * 0.3})`;
      a.beginPath();
      a.arc(px, py, r, 0, Math.PI * 2);
      a.fill();
      // shadow on one side
      a.fillStyle = "rgba(20,12,6,0.30)";
      a.beginPath();
      a.arc(px + r * 0.35, py + r * 0.35, r * 0.7, 0, Math.PI * 2);
      a.fill();
    });
  }
  albedo.update();

  // --- bump (multi-octave grayscale) ---
  // Builds relief from coarse undulations down to fine grain so headlight / lamp
  // light catches real surface structure. Kept centered on 128 (neutral) so the
  // applied bumpTexture.level can stay modest and avoid grazing-angle sparkle.
  const bump = new DynamicTexture("dirtBump", { width: S, height: S }, scene, true);
  const b = bump.getContext() as CanvasRenderingContext2D;
  b.fillStyle = "#808080";
  b.fillRect(0, 0, S, S);

  // Octave 1 — broad humps & hollows (ruts, packed swells).
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 40 + Math.random() * 130;
    const up = Math.random() < 0.5;
    const amp = 26 + Math.random() * 22;
    const lvl = (up ? 128 + amp : 128 - amp) | 0;
    wrapDraw(b, x, y, (px, py) => {
      const g = b.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${lvl},${lvl},${lvl},0.5)`);
      g.addColorStop(1, "rgba(128,128,128,0)");
      b.fillStyle = g;
      b.fillRect(0, 0, S, S);
    });
  }
  // Octave 2 — mid clods.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 5 + Math.random() * 16;
    const up = Math.random() < 0.5;
    const lvl = (up ? 128 + (30 + Math.random() * 30) : 128 - (30 + Math.random() * 30)) | 0;
    wrapDraw(b, x, y, (px, py) => {
      const g = b.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${lvl},${lvl},${lvl},0.55)`);
      g.addColorStop(1, "rgba(128,128,128,0)");
      b.fillStyle = g;
      b.fillRect(0, 0, S, S);
    });
  }
  // Octave 3 — fine grit, raised pebbles.
  for (let i = 0; i < 60000; i++) {
    const x = Math.random() * S, y = Math.random() * S, s = Math.random() * 2.5;
    const g = 128 + (Math.random() * 2 - 1) * 70;
    b.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
    b.fillRect(x, y, s, s);
  }
  bump.update();

  for (const t of [albedo, bump]) {
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = tile;
    t.vScale = tile;
    t.anisotropicFilteringLevel = 16; // kill grazing-angle moiré on the dirt
  }
  return { albedo, bump };
}
