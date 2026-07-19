import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SkyMaterial } from "@babylonjs/materials/sky/skyMaterial";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";

/** Afternoon sun direction (points FROM sky TO ground). */
export const SUN_DIR = new Vector3(-0.4, -0.92, 0.32).normalize();

export interface EnvHandles {
  pipeline: DefaultRenderingPipeline;
  ssao: SSAO2RenderingPipeline | null;
}

/**
 * Modern outdoor look: atmospheric SkyMaterial dome, image-based lighting for
 * reflections, ACES tone mapping, bloom, SSAO grounding, FXAA + sharpen, and a
 * light dusty haze.
 */
export function setupEnvironment(scene: Scene, camera: Camera, night = false, highQuality = true): EnvHandles {
  // --- IBL for reflections only (not used as the visible sky) ---
  const env = CubeTexture.CreateFromPrefilteredData(import.meta.env.BASE_URL + "env/environment.env", scene);
  env.gammaSpace = false;
  scene.environmentTexture = env;
  // Lift night IBL a touch so chrome wheels / wings / glossy bodies catch the moon
  // and lamp light with real metallic depth (still reads dark overall).
  scene.environmentIntensity = night ? 0.22 : 0.5;

  // --- Atmospheric sky dome (inclination/azimuth config) ---
  const sky = new SkyMaterial("skyMat", scene);
  sky.backFaceCulling = false;
  sky.turbidity = night ? 22 : 8; // hazier night sky → deeper, smoother gradient
  sky.luminance = night ? 0.085 : 1.0; // darker so the moon/stars/lamps pop
  sky.rayleigh = night ? 0.42 : 2.0;
  sky.mieCoefficient = night ? 0.004 : 0.005;
  sky.mieDirectionalG = 0.82;
  sky.useSunPosition = false;
  sky.inclination = night ? 0.5 : 0.35; // sun well below horizon at night
  sky.azimuth = 0.27;
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 2000 }, scene);
  skybox.material = sky;
  skybox.infiniteDistance = true;
  skybox.isPickable = false;

  // Deeper indigo night clear/ambient so shadows have cool color instead of flat black.
  scene.clearColor = night ? new Color4(0.018, 0.026, 0.05, 1) : new Color4(0.5, 0.65, 0.85, 1);
  scene.ambientColor = night ? new Color3(0.07, 0.085, 0.14) : new Color3(0.45, 0.45, 0.45);

  if (night) addNightSky(scene); // crescent moon + scattered stars overhead

  // --- Light dust haze toward horizon (cool/dark at night) ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = night ? new Color3(0.035, 0.045, 0.085) : new Color3(0.78, 0.82, 0.88);
  scene.fogDensity = night ? 0.0028 : 0.0015;

  // --- Post pipeline ---
  const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
  pipeline.samples = highQuality ? 8 : 4; // 8x MSAA on desktop; phones keep the lighter 4x
  pipeline.fxaaEnabled = true;

  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  // Night: lift exposure so the dim track/cars stay readable while ACES keeps the
  // bright lamp towers + moon from blowing out; punch contrast for a moodier image.
  ip.exposure = night ? 1.15 : 1.0;
  ip.contrast = night ? 1.42 : 1.25;
  // Cool the midtones at night so the world reads as cold moonlight, not muddy gray.
  if (night) {
    const cc = new ColorCurves();
    cc.globalSaturation = 8;        // slightly richer color in the dark
    cc.shadowsHue = 220; cc.shadowsDensity = 18; cc.shadowsSaturation = 30; // blue shadows
    cc.highlightsHue = 48; cc.highlightsDensity = 8; cc.highlightsSaturation = 14; // warm lamp glow
    ip.colorCurves = cc;
    ip.colorCurvesEnabled = true;
  }
  // Stronger, darker vignette at night frames the moonlit bowl and hides the horizon haze.
  ip.vignetteEnabled = true;
  ip.vignetteWeight = night ? 2.4 : 1.1;
  ip.vignetteColor = new Color4(0, 0, 0.02, 0);

  pipeline.bloomEnabled = true;
  // Lower threshold at night so the lamp towers, moon, and bright stars bloom; tighter
  // weight + larger kernel give a soft, glowing falloff instead of a harsh halo.
  pipeline.bloomThreshold = night ? 0.62 : 0.9;
  pipeline.bloomWeight = night ? 0.42 : 0.26;
  pipeline.bloomKernel = night ? 96 : 64;
  pipeline.bloomScale = 0.5;

  // Cheap chromatic aberration on desktop — a faint lens fringe at the frame edges that
  // makes the lamp/moon glow feel more cinematic. Skipped on mobile to save the pass.
  if (highQuality) {
    pipeline.chromaticAberrationEnabled = true;
    pipeline.chromaticAberration.aberrationAmount = night ? 6 : 3;
    pipeline.chromaticAberration.radialIntensity = 0.7;
  }

  // Subtle film grain at night breaks up flat dark sky banding (very light, cheap).
  if (night) {
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = highQuality ? 6 : 4;
    pipeline.grain.animated = true;
  }

  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = night ? 0.26 : 0.22;

  // SSAO handle is exposed so the adaptive-quality controller can scale its sample
  // count at runtime; stays null if the SSAO2 pipeline failed to build (weak GPU).
  let ssaoHandle: SSAO2RenderingPipeline | null = null;
  try {
    const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 1.0;
    // Stronger contact shadows at night so cars/people/props feel grounded against the
    // dark dirt (no floating); QualityManager scales totalStrength/samples at runtime.
    ssao.totalStrength = night ? 1.5 : 1.0;
    ssao.base = night ? 0.12 : 0.2; // less ambient fill → deeper crevices
    ssao.epsilon = 0.02; // kills false self-occlusion blotches on flat dirt at low sample counts
    ssao.expensiveBlur = highQuality; // cleaner edges on desktop
    ssao.samples = highQuality ? 16 : 8; // smoother occlusion on desktop; phones keep 8
    ssao.maxZ = 90;
    ssaoHandle = ssao;
  } catch (e) {
    console.warn("[RCSprint] SSAO unavailable", e);
  }

  return { pipeline, ssao: ssaoHandle };
}

/**
 * Night sky dressing: a dome of scattered stars and a crescent moon, both emissive
 * and fog-exempt so they read brightly against the dark sky. Drawn as real far
 * geometry (inside the skybox), so they sit behind the track and backdrop.
 */
function addNightSky(scene: Scene): void {
  // --- Starfield: random dots on a big inward-facing dome; gaps stay transparent ---
  const starTex = new DynamicTexture("starTex", { width: 2048, height: 1024 }, scene, true);
  const sc = starTex.getContext() as CanvasRenderingContext2D;
  sc.clearRect(0, 0, 2048, 1024);
  // A faint diagonal Milky-Way band of dense, dim dust before the main field.
  for (let i = 0; i < 1400; i++) {
    const t = Math.random();
    const bx = t * 2048;
    const by = 360 + t * 280 + (Math.random() - 0.5) * 150; // sweeping band
    sc.fillStyle = `rgba(200,210,255,${(0.05 + Math.random() * 0.12).toFixed(3)})`;
    sc.beginPath(); sc.arc(bx, by, Math.random() < 0.85 ? 1.0 : 1.8, 0, Math.PI * 2); sc.fill();
  }
  // Main scattered field with slight color temperature variation (warm/white/blue stars).
  for (let i = 0; i < 1300; i++) {
    const x = Math.random() * 2048, y = Math.random() * 1024;
    const roll = Math.random();
    const r = roll < 0.78 ? 1.6 : roll < 0.95 ? 2.8 : 4.0; // a few brighter standouts
    const tint = Math.random();
    const col = tint < 0.2 ? "255,236,210" : tint < 0.8 ? "255,255,255" : "210,224,255";
    const a = (0.55 + Math.random() * 0.45).toFixed(2);
    // soft glow halo on the bright ones so bloom blooms a believable point of light
    if (r >= 2.8) {
      const g = sc.createRadialGradient(x, y, 0, x, y, r * 3.5);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      sc.fillStyle = g;
      sc.beginPath(); sc.arc(x, y, r * 3.5, 0, Math.PI * 2); sc.fill();
    }
    sc.fillStyle = `rgba(${col},${a})`;
    sc.beginPath(); sc.arc(x, y, r, 0, Math.PI * 2); sc.fill();
  }
  starTex.update();
  starTex.hasAlpha = true;
  const starMat = new StandardMaterial("starMat", scene);
  starMat.diffuseTexture = starTex;
  starMat.emissiveTexture = starTex;
  starMat.emissiveColor = new Color3(1.5, 1.5, 1.7); // > 1 so bloom catches the stars
  starMat.disableLighting = true;
  starMat.useAlphaFromDiffuseTexture = true;
  starMat.backFaceCulling = false; // seen from inside the dome
  // Dome sits beyond the backdrop (~150u) but well inside the skybox, so stars read large.
  const dome = MeshBuilder.CreateSphere("starDome", { diameter: 1200, segments: 24 }, scene);
  dome.material = starMat;
  dome.applyFog = false;
  dome.isPickable = false;

  // --- Horizon light-pollution glow: night photos of lit tracks show a faint warm-violet
  //     band hugging the horizon (stadium floods scattering in haze) while the zenith stays
  //     near-black. A short open cylinder ringing the scene with a vertical fade sells it. ---
  const glowTex = new DynamicTexture("horizonGlowTex", { width: 8, height: 128 }, scene, false);
  const gc = glowTex.getContext() as CanvasRenderingContext2D;
  const grad = gc.createLinearGradient(0, 128, 0, 0); // bottom (horizon) → top
  grad.addColorStop(0.0, "rgba(74,53,80,0.5)");   // #4A3550 warm-violet at the horizon
  grad.addColorStop(0.45, "rgba(58,46,62,0.22)"); // #3A2E3E fading
  grad.addColorStop(1.0, "rgba(20,22,32,0)");     // gone well below the star field
  gc.fillStyle = grad;
  gc.fillRect(0, 0, 8, 128);
  glowTex.update();
  glowTex.hasAlpha = true;
  const glowMat = new StandardMaterial("horizonGlowMat", scene);
  glowMat.diffuseTexture = glowTex;
  glowMat.emissiveTexture = glowTex;
  glowMat.emissiveColor = new Color3(0.9, 0.8, 1.0);
  glowMat.disableLighting = true;
  glowMat.useAlphaFromDiffuseTexture = true;
  glowMat.backFaceCulling = false; // seen from inside the ring
  const glowRing = MeshBuilder.CreateCylinder("horizonGlow", {
    diameter: 1100, height: 150, cap: Mesh.NO_CAP, tessellation: 48,
  }, scene);
  glowRing.position.y = 55; // band bottom sits just below eye level, fading out by ~130u up
  glowRing.material = glowMat;
  glowRing.applyFog = false;
  glowRing.isPickable = false;

  // --- Crescent moon: a filled disc with an offset circle punched out, billboarded ---
  const moonTex = new DynamicTexture("moonTex", { width: 256, height: 256 }, scene, true);
  const mc = moonTex.getContext() as CanvasRenderingContext2D;
  mc.clearRect(0, 0, 256, 256);
  // subtle cratering on the lit disc for texture
  mc.fillStyle = "#f5f2dc";
  mc.beginPath(); mc.arc(120, 130, 92, 0, Math.PI * 2); mc.fill();
  mc.fillStyle = "rgba(210,205,180,0.55)";
  for (const [cx, cy, cr] of [[100, 110, 12], [85, 150, 9], [125, 165, 7], [110, 95, 6]] as const) {
    mc.beginPath(); mc.arc(cx, cy, cr, 0, Math.PI * 2); mc.fill();
  }
  mc.globalCompositeOperation = "destination-out"; // carve the crescent
  mc.beginPath(); mc.arc(168, 104, 84, 0, Math.PI * 2); mc.fill();
  mc.globalCompositeOperation = "source-over";
  moonTex.update();
  moonTex.hasAlpha = true;
  const moonMat = new StandardMaterial("moonMat", scene);
  moonMat.diffuseTexture = moonTex;
  moonMat.emissiveTexture = moonTex;
  moonMat.emissiveColor = new Color3(1.15, 1.15, 1.05); // > 1 so bloom catches the moon
  moonMat.disableLighting = true;
  moonMat.useAlphaFromDiffuseTexture = true;
  moonMat.backFaceCulling = false;
  const moonPos = new Vector3(-150, 235, -395); // up among the stars, inside the dome
  const moon = MeshBuilder.CreatePlane("moon", { size: 85 }, scene);
  moon.material = moonMat;
  moon.position = moonPos;
  moon.billboardMode = Mesh.BILLBOARDMODE_ALL;
  moon.applyFog = false;
  moon.isPickable = false;

  // --- Soft moon halo: a larger radial-gradient billboard behind the moon so the
  //     surrounding sky glows and bloom picks up an atmospheric corona. ---
  const haloTex = new DynamicTexture("moonHaloTex", { width: 256, height: 256 }, scene, true);
  const hc = haloTex.getContext() as CanvasRenderingContext2D;
  hc.clearRect(0, 0, 256, 256);
  const halo = hc.createRadialGradient(128, 128, 10, 128, 128, 128);
  halo.addColorStop(0, "rgba(225,228,245,0.55)");
  halo.addColorStop(0.35, "rgba(180,195,235,0.18)");
  halo.addColorStop(1, "rgba(150,170,220,0)");
  hc.fillStyle = halo;
  hc.fillRect(0, 0, 256, 256);
  haloTex.update();
  haloTex.hasAlpha = true;
  const haloMat = new StandardMaterial("moonHaloMat", scene);
  haloMat.diffuseTexture = haloTex;
  haloMat.emissiveTexture = haloTex;
  haloMat.emissiveColor = new Color3(0.8, 0.85, 1.0);
  haloMat.disableLighting = true;
  haloMat.useAlphaFromDiffuseTexture = true;
  haloMat.backFaceCulling = false;
  const moonHalo = MeshBuilder.CreatePlane("moonHalo", { size: 230 }, scene);
  moonHalo.material = haloMat;
  moonHalo.position = moonPos.clone();
  moonHalo.position.z += 4; // just behind the moon disc
  moonHalo.billboardMode = Mesh.BILLBOARDMODE_ALL;
  moonHalo.applyFog = false;
  moonHalo.isPickable = false;

  // --- Big Dipper (Ursa Major) — NORTH is up: the pointer stars Merak→Dubhe point up
  //     toward Polaris. Built as bright emissive dots on a billboarded group so the
  //     asterism always faces the viewer with +y up, wherever the sky is in frame. ---
  const dipper: [number, number][] = [
    [-4.0, 1.2], [-2.8, 0.7], [-1.6, 0.35], [-0.4, 0.0], // Alkaid, Mizar, Alioth, Megrez (handle → bowl)
    [0.2, -1.0], [1.7, -0.9], [1.5, 0.3],                 // Phecda, Merak, Dubhe (bowl)
  ];
  const dipRoot = new TransformNode("bigDipper", scene);
  dipRoot.position = new Vector3(150, 300, -360); // high in the sky, opposite the moon
  dipRoot.billboardMode = Mesh.BILLBOARDMODE_ALL; // face the viewer; local +y stays up = north
  const dipMat = new StandardMaterial("dipperMat", scene);
  dipMat.emissiveColor = new Color3(1.9, 1.9, 2.1); // brighter than the random field
  dipMat.disableLighting = true;
  const DS = 22; // spread of the asterism
  for (let i = 0; i < dipper.length; i++) {
    const dot = MeshBuilder.CreateSphere("dipper" + i, { diameter: 7, segments: 8 }, scene);
    dot.parent = dipRoot;
    dot.position.set(dipper[i][0] * DS, dipper[i][1] * DS, 0);
    dot.material = dipMat;
    dot.applyFog = false;
    dot.isPickable = false;
  }
}
