import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
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
export function setupEnvironment(scene: Scene, camera: Camera): EnvHandles {
  // --- IBL for reflections only (not used as the visible sky) ---
  const env = CubeTexture.CreateFromPrefilteredData("/env/environment.env", scene);
  env.gammaSpace = false;
  scene.environmentTexture = env;
  scene.environmentIntensity = 0.5;

  // --- Atmospheric sky dome (inclination/azimuth config) ---
  const sky = new SkyMaterial("skyMat", scene);
  sky.backFaceCulling = false;
  sky.turbidity = 8;
  sky.luminance = 1.0;
  sky.rayleigh = 2.0;
  sky.mieCoefficient = 0.005;
  sky.mieDirectionalG = 0.82;
  sky.useSunPosition = false;
  sky.inclination = 0.35; // sun elevation (0 = zenith .. 0.5 = horizon)
  sky.azimuth = 0.27;
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 2000 }, scene);
  skybox.material = sky;
  skybox.infiniteDistance = true;
  skybox.isPickable = false;

  scene.clearColor = new Color4(0.5, 0.65, 0.85, 1);
  scene.ambientColor = new Color3(0.45, 0.45, 0.45);

  // --- Light dust haze toward horizon ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.78, 0.82, 0.88);
  scene.fogDensity = 0.0015;

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
