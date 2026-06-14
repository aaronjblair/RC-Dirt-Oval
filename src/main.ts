import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Materials/standardMaterial";

/**
 * M0 — Scaffold & render.
 * Driver-stand vantage of a dirt arena with PBR ground, sun + ambient,
 * shadows, and a few placeholder sprint-car bodies so lighting/shadows read.
 * Physics, real oval, and driving arrive in M1/M2.
 */

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

const scene = new Scene(engine);
scene.clearColor = new Color4(0.46, 0.58, 0.74, 1.0); // hazy daytime sky
scene.ambientColor = new Color3(0.35, 0.35, 0.4);

// --- Driver-stand camera: fixed, elevated, trackside vantage like real RC ---
const camera = new UniversalCamera("driverStand", new Vector3(0, 9, -30), scene);
camera.setTarget(new Vector3(0, 0, 4));
camera.fov = 0.7;
camera.minZ = 0.2;
camera.maxZ = 400;
camera.attachControl(canvas, true); // free-look while we build; locked in later milestones

// --- Lighting ---
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1.1, 0.4), scene);
sun.position = new Vector3(40, 60, -30);
sun.intensity = 2.6;
const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
ambient.intensity = 0.55;
ambient.groundColor = new Color3(0.3, 0.22, 0.16);

const shadow = new ShadowGenerator(2048, sun);
shadow.useBlurExponentialShadowMap = true;
shadow.blurKernel = 24;
shadow.darkness = 0.45;

// --- Dirt ground (PBR) ---
const ground = MeshBuilder.CreateGround("ground", { width: 120, height: 120, subdivisions: 4 }, scene);
const dirt = new PBRMaterial("dirt", scene);
dirt.albedoColor = new Color3(0.34, 0.22, 0.14);
dirt.roughness = 0.95;
dirt.metallic = 0.0;
ground.material = dirt;
ground.receiveShadows = true;

// Faint groove ring to hint at the oval racing line to come
const groove = MeshBuilder.CreateTorus("groove", { diameter: 44, thickness: 6, tessellation: 64 }, scene);
groove.scaling = new Vector3(1.0, 0.01, 0.62);
groove.position.y = 0.02;
const grooveMat = new StandardMaterial("grooveMat", scene);
grooveMat.diffuseColor = new Color3(0.2, 0.16, 0.13);
grooveMat.specularColor = new Color3(0, 0, 0);
groove.material = grooveMat;
groove.receiveShadows = true;

// --- Placeholder sprint cars (boxes + top wing) so shadows/lighting read ---
const carColors = [
  new Color3(0.85, 0.12, 0.12),
  new Color3(0.95, 0.78, 0.1),
  new Color3(0.1, 0.4, 0.9),
  new Color3(0.1, 0.7, 0.35),
];
carColors.forEach((c, i) => {
  const body = MeshBuilder.CreateBox(`car${i}`, { width: 1.4, height: 0.5, depth: 2.4 }, scene);
  body.position = new Vector3(-4.5 + i * 3, 0.35, 2 + (i % 2));
  const m = new PBRMaterial(`carMat${i}`, scene);
  m.albedoColor = c;
  m.roughness = 0.35;
  m.metallic = 0.1;
  body.material = m;
  shadow.addShadowCaster(body);

  // Big top wing — the iconic winged sprint car silhouette
  const wing = MeshBuilder.CreateBox(`wing${i}`, { width: 1.7, height: 0.06, depth: 1.5 }, scene);
  wing.parent = body;
  wing.position = new Vector3(0, 0.75, -0.1);
  wing.rotation.x = -0.12;
  const wm = new PBRMaterial(`wingMat${i}`, scene);
  wm.albedoColor = c.scale(0.85);
  wm.roughness = 0.4;
  wing.material = wm;
  shadow.addShadowCaster(wing);
});

// --- Render loop + FPS ---
let acc = 0;
scene.onBeforeRenderObservable.add(() => {
  acc += engine.getDeltaTime();
  if (acc > 250) {
    fpsEl.textContent = `${engine.getFps().toFixed(0)} fps`;
    acc = 0;
  }
});

scene.executeWhenReady(() => {
  loadingEl.style.display = "none";
  console.log("[RCSprint] M0 scene ready");
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
