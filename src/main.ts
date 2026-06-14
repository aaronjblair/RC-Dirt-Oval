import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { initPhysics } from "./physics/PhysicsWorld";
import { InputManager } from "./core/Input";
import { DriverStandCamera } from "./core/DriverStandCamera";
import { setupEnvironment, SUN_DIR } from "./core/Environment";
import { OvalTrack } from "./track/OvalTrack";
import { buildScenery } from "./track/Scenery";
import { TRACK_M2 } from "./track/TrackDef";
import { RaceManager } from "./race/RaceManager";
import { Field } from "./race/Field";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const el = (id: string) => document.getElementById(id) as HTMLElement;

const SCALE_MPH = 2.5;
const fmt = (t: number) => (t > 0 ? t.toFixed(2) : "--");

async function boot() {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene(engine);
  const plugin = await initPhysics(scene);

  const cam = new DriverStandCamera(scene, canvas);
  scene.activeCamera = cam.camera;
  setupEnvironment(scene, cam.camera);

  const sun = new DirectionalLight("sun", SUN_DIR, scene);
  sun.position = SUN_DIR.scale(-90);
  sun.intensity = 3.4;
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.3;
  ambient.groundColor = new Color3(0.4, 0.32, 0.24);

  const shadow = new ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 32;
  shadow.darkness = 0.4;
  shadow.bias = 0.0018;

  // Track + scenery
  const track = new OvalTrack(scene, plugin, shadow, TRACK_M2);
  const scenery = buildScenery(scene, track, shadow);
  cam.setStand(scenery.standPosition);

  // Race timing + full field (player + AI)
  const race = new RaceManager(track, TRACK_M2.laps);
  const field = new Field(scene, plugin, shadow, track, TRACK_M2, race);
  const player = race.racers.find((r) => r.isPlayer)!;
  race.start(performance.now());

  const input = new InputManager();
  (window as any).__field = field;
  (window as any).__track = track;
  (window as any).__race = race;

  let acc = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.033, engine.getDeltaTime() / 1000);
    const drive = input.sample();
    field.update(dt, drive);

    const now = performance.now();
    race.update(now);
    cam.update(field.playerVehicle.position, dt);

    acc += engine.getDeltaTime();
    if (acc > 90) {
      acc = 0;
      fpsEl.textContent = `${engine.getFps().toFixed(0)} fps`;
      el("hudSpeed").textContent = `${Math.round(field.playerVehicle.speed * SCALE_MPH)}`;
      el("hudLap").innerHTML = `${Math.max(1, player.lap)}<small>/${TRACK_M2.laps}</small>`;
      el("hudPos").innerHTML = `${race.positionOf(player)}<small>/${race.racers.length}</small>`;
      el("hudTime").textContent = fmt(race.curLapTime(player, now));
      el("hudBest").textContent = fmt(player.bestLap);
    }
  });

  scene.executeWhenReady(() => {
    loadingEl.style.display = "none";
    console.log("[RCSprint] M2 ready — drive the oval; lap timing live");
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

boot().catch((e) => {
  console.error("[RCSprint] boot failed", e);
  loadingEl.textContent = "Boot failed — see console";
});
