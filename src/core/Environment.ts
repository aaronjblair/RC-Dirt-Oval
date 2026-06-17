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
}

/**
 * Modern outdoor look: atmospheric SkyMaterial dome, image-based lighting for
 * reflections, ACES tone mapping, bloom, SSAO grounding, FXAA + sharpen, and a
 * light dusty haze.
 */
export function setupEnvironment(scene: Scene, camera: Camera, night = false): EnvHandles {
  // --- IBL for reflections only (not used as the visible sky) ---
  const env = CubeTexture.CreateFromPrefilteredData(import.meta.env.BASE_URL + "env/environment.env", scene);
  env.gammaSpace = false;
  scene.environmentTexture = env;
  scene.environmentIntensity = night ? 0.12 : 0.5;

  // --- Atmospheric sky dome (inclination/azimuth config) ---
  const sky = new SkyMaterial("skyMat", scene);
  sky.backFaceCulling = false;
  sky.turbidity = night ? 18 : 8;
  sky.luminance = night ? 0.12 : 1.0;
  sky.rayleigh = night ? 0.5 : 2.0;
  sky.mieCoefficient = 0.005;
  sky.mieDirectionalG = 0.82;
  sky.useSunPosition = false;
  sky.inclination = night ? 0.49 : 0.35; // sun below horizon at night
  sky.azimuth = 0.27;
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 2000 }, scene);
  skybox.material = sky;
  skybox.infiniteDistance = true;
  skybox.isPickable = false;

  scene.clearColor = night ? new Color4(0.03, 0.04, 0.07, 1) : new Color4(0.5, 0.65, 0.85, 1);
  scene.ambientColor = night ? new Color3(0.1, 0.11, 0.16) : new Color3(0.45, 0.45, 0.45);

  if (night) addNightSky(scene); // crescent moon + scattered stars overhead

  // --- Light dust haze toward horizon (cool/dark at night) ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = night ? new Color3(0.05, 0.06, 0.1) : new Color3(0.78, 0.82, 0.88);
  scene.fogDensity = night ? 0.0026 : 0.0015;

  // --- Post pipeline ---
  const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;

  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.0;
  ip.contrast = 1.18;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.1;
  ip.vignetteColor = new Color4(0, 0, 0, 0);

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.9;
  pipeline.bloomWeight = 0.22;
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;

  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.22;

  try {
    const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 0.9;
    ssao.totalStrength = 1.0;
    ssao.base = 0.2;
    ssao.samples = 8;
    ssao.maxZ = 90;
  } catch (e) {
    console.warn("[RCSprint] SSAO unavailable", e);
  }

  return { pipeline };
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
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 2048, y = Math.random() * 1024;
    const r = Math.random() < 0.8 ? 1.8 : 3.2; // a few brighter standouts
    sc.fillStyle = `rgba(255,255,255,${(0.6 + Math.random() * 0.4).toFixed(2)})`;
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

  // --- Crescent moon: a filled disc with an offset circle punched out, billboarded ---
  const moonTex = new DynamicTexture("moonTex", { width: 256, height: 256 }, scene, true);
  const mc = moonTex.getContext() as CanvasRenderingContext2D;
  mc.clearRect(0, 0, 256, 256);
  mc.fillStyle = "#f5f2dc";
  mc.beginPath(); mc.arc(120, 130, 92, 0, Math.PI * 2); mc.fill();
  mc.globalCompositeOperation = "destination-out"; // carve the crescent
  mc.beginPath(); mc.arc(168, 104, 84, 0, Math.PI * 2); mc.fill();
  mc.globalCompositeOperation = "source-over";
  moonTex.update();
  moonTex.hasAlpha = true;
  const moonMat = new StandardMaterial("moonMat", scene);
  moonMat.diffuseTexture = moonTex;
  moonMat.emissiveTexture = moonTex;
  moonMat.emissiveColor = new Color3(1, 1, 0.92);
  moonMat.disableLighting = true;
  moonMat.useAlphaFromDiffuseTexture = true;
  moonMat.backFaceCulling = false;
  const moon = MeshBuilder.CreatePlane("moon", { size: 85 }, scene);
  moon.material = moonMat;
  moon.position = new Vector3(-150, 235, -395); // up among the stars, inside the dome
  moon.billboardMode = Mesh.BILLBOARDMODE_ALL;
  moon.applyFog = false;
  moon.isPickable = false;

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
