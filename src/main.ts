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
import { generateCareer } from "./track/tracks";
import { RaceManager } from "./race/RaceManager";
import { Field } from "./race/Field";
import { loadSetup, saveSetup } from "./car/CarSetup";
import { SetupPanel } from "./ui/SetupPanel";
import { Screens } from "./ui/Screens";
import { loadCareer, saveCareer, resetCareer, awardPoints, standings, POINTS } from "./career/Career";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const el = (id: string) => document.getElementById(id) as HTMLElement;

const SCALE_MPH = 2.5;
const fmt = (t: number) => (t > 0 ? t.toFixed(2) : "--");

type State = "prerace" | "racing" | "finished";

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

  // --- Career round selection ---
  const careerTracks = generateCareer();
  const career = loadCareer();
  const round = Math.min(career.round, careerTracks.length - 1);
  const def = careerTracks[round];

  // --- Build the round ---
  const track = new OvalTrack(scene, plugin, shadow, def);
  const scenery = buildScenery(scene, track, shadow);
  cam.setStand(scenery.standPosition);

  const setup = loadSetup();
  const race = new RaceManager(track, def.laps);
  const field = new Field(scene, plugin, shadow, track, def, race, setup);
  const player = race.racers.find((r) => r.isPlayer)!;

  const input = new InputManager();
  new SetupPanel(setup, (s) => { field.applyPlayerSetup(s); saveSetup(s); });

  const status = document.createElement("div");
  status.style.cssText =
    "position:absolute;left:14px;bottom:14px;font:12px/1.5 'Segoe UI',system-ui,sans-serif;color:#dfe7f0;" +
    "background:rgba(0,0,0,0.38);padding:8px 12px;border-radius:8px;min-width:170px;";
  hud.appendChild(status);

  (window as any).__field = field;
  (window as any).__track = track;
  (window as any).__race = race;

  // --- Game flow state machine ---
  let state: State = "prerace";
  let awarded = false;
  const raceDist = def.laps * track.length;

  const finalize = () => {
    if (awarded) return;
    awarded = true;
    state = "finished";
    const order = race.racers.map((r) => r.name);
    const gained = order.map((_, i) => POINTS[i] ?? 0);
    awardPoints(career, order);
    career.unlocked = Math.max(career.unlocked, Math.min(round + 1, careerTracks.length - 1));
    saveCareer(career);
    const isFinale = round >= careerTracks.length - 1;
    const champ = standings(career);
    Screens.results({
      title: `${def.name} — Finished P${race.positionOf(player)}`,
      order: order.map((name, i) => ({ name, gained: gained[i] })),
      champ,
      isFinale,
      champion: champ[0]?.name,
      onNext: () => { career.round = Math.min(round + 1, careerTracks.length - 1); saveCareer(career); location.reload(); },
      onReplay: () => location.reload(),
      onReset: () => { resetCareer(); location.reload(); },
    });
  };

  const startRacing = () => {
    Screens.countdown(() => { race.start(performance.now()); state = "racing"; });
  };

  scene.executeWhenReady(() => {
    loadingEl.style.display = "none";
    Screens.preRace(def, round, careerTracks.length, standings(career), startRacing);
    console.log(`[RCSprint] M5 ready — round ${round + 1}: ${def.name}`);
  });

  let acc = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.033, engine.getDeltaTime() / 1000);
    if (state === "racing") {
      const drive = input.sample();
      const raceFraction = Math.min(1, player.progress / raceDist);
      field.update(dt, drive, raceFraction);
      race.update(performance.now());
      if (player.finished) finalize();
    }
    cam.update(field.playerVehicle.position, dt);

    acc += engine.getDeltaTime();
    if (acc > 90) {
      acc = 0;
      const now = performance.now();
      fpsEl.textContent = `${engine.getFps().toFixed(0)} fps`;
      el("hudSpeed").textContent = `${Math.round(field.playerVehicle.speed * SCALE_MPH)}`;
      el("hudLap").innerHTML = `${Math.max(1, player.lap)}<small>/${def.laps}</small>`;
      el("hudPos").innerHTML = `${race.positionOf(player)}<small>/${race.racers.length}</small>`;
      el("hudTime").textContent = fmt(race.curLapTime(player, now));
      el("hudBest").textContent = fmt(player.bestLap);
      const wear = Math.round(field.playerTireWear * 100);
      status.innerHTML =
        `<b style="color:#ffd34d">${def.name}</b><br>` +
        `<b style="color:#ffd34d">TRACK</b> ${field.surface.state}<br>` +
        `<b style="color:#ffd34d">TIRES</b> ${100 - wear}% &nbsp;<span style="color:#9aa6b3">grip ${field.playerVehicle.gripMult.toFixed(2)}</span><br>` +
        `<span style="color:#9aa6b3">press <b>G</b> for garage</span>`;
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

boot().catch((e) => {
  console.error("[RCSprint] boot failed", e);
  loadingEl.textContent = "Boot failed — see console";
});
