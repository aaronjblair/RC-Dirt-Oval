import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { initPhysics } from "./physics/PhysicsWorld";
import { InputManager } from "./core/Input";
import { DriverStandCamera } from "./core/DriverStandCamera";
import { CinematicCamera } from "./core/CinematicCamera";
import { setupEnvironment, SUN_DIR } from "./core/Environment";
import { OvalTrack } from "./track/OvalTrack";
import { buildScenery } from "./track/Scenery";
import { generateCareer } from "./track/tracks";
import { RaceManager } from "./race/RaceManager";
import { Field } from "./race/Field";
import { Marshals } from "./race/Marshals";
import { FlagGirl } from "./race/FlagGirl";
import { loadSetup, saveSetup } from "./car/CarSetup";
import { SetupPanel } from "./ui/SetupPanel";
import { Screens } from "./ui/Screens";
import { Minimap } from "./ui/Minimap";
import { EngineAudio } from "./core/Audio";
import { loadCareer, saveCareer, resetCareer, awardPoints, standings, POINTS } from "./career/Career";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const el = (id: string) => document.getElementById(id) as HTMLElement;

const SCALE_MPH = 2.5;
const fmt = (t: number) => (t > 0 ? t.toFixed(2) : "--");

type State = "attract" | "prerace" | "racing" | "finished";

async function boot() {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  // Desktop renders at CSS size. Phones (coarse pointer) render at ~2x CSS pixels — sharp on a
  // retina screen without paying for the full 3x device-pixel-ratio (keeps it smooth and crisp).
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const dpr = window.devicePixelRatio || 1;
  // ~2x CSS pixels on retina (sharp), floored at 1.3 so a weaker phone never overloads.
  engine.setHardwareScalingLevel(coarsePointer ? Math.min(1.8, Math.max(1.3, dpr / 2)) : 1);

  const scene = new Scene(engine);
  const plugin = await initPhysics(scene);

  // --- Career round selection (needed up front so night lighting matches the track) ---
  const careerTracks = generateCareer();
  const career = loadCareer();
  // `?round=N` (1-based) forces a specific career round — a dev/preview affordance
  // (like `?demo`) for eyeballing a given track's backdrop/layout without playing up to it.
  const roundParam = new URLSearchParams(location.search).get("round");
  const round = roundParam != null
    ? Math.min(Math.max(0, parseInt(roundParam, 10) - 1) || 0, careerTracks.length - 1)
    : Math.min(career.round, careerTracks.length - 1);
  const def = careerTracks[round];

  const cam = new DriverStandCamera(scene, canvas);
  scene.activeCamera = cam.camera;
  const env = setupEnvironment(scene, cam.camera, def.night);

  // Aerial / spectator camera (toggle with C) — high view of the whole oval
  const aerialCam = new UniversalCamera("aerial", new Vector3(0, 105, -55), scene);
  aerialCam.minZ = 0.2; aerialCam.maxZ = 6000; aerialCam.fov = 0.8;
  aerialCam.inputs.clear();
  aerialCam.setTarget(new Vector3(0, 0, 0));
  env.pipeline.addCamera(aerialCam);
  let aerial = false;
  window.addEventListener("keydown", (e) => { if (e.code === "KeyC") aerial = !aerial; });

  // Cinematic "broadcast" camera for the opening attract reel
  const cine = new CinematicCamera(scene);
  env.pipeline.addCamera(cine.camera);

  const sun = new DirectionalLight("sun", SUN_DIR, scene);
  sun.position = SUN_DIR.scale(-90);
  sun.intensity = def.night ? 0.25 : 3.4; // moonlight only at night; towers carry the scene
  if (def.night) sun.diffuse = new Color3(0.5, 0.6, 0.9);
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = def.night ? 0.14 : 0.3;
  ambient.groundColor = def.night ? new Color3(0.06, 0.06, 0.1) : new Color3(0.4, 0.32, 0.24);

  const shadow = new ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 16;
  shadow.darkness = 0.4;
  shadow.bias = 0.0018;

  // --- Build the round ---
  const track = new OvalTrack(scene, plugin, shadow, def);
  const scenery = buildScenery(scene, track, shadow, def.night);
  cam.setStand(scenery.standPosition);
  cam.frameTrack(def); // size the stand camera so the whole oval (+ infield logo) stays in frame

  const setup = loadSetup();
  const race = new RaceManager(track, def.laps);
  const field = new Field(scene, plugin, shadow, track, def, race, setup);
  const player = race.racers.find((r) => r.isPlayer)!;
  // Trackside + pit marshals: stand around the track, and right cars that flip.
  const marshals = new Marshals(scene, track, shadow);
  // Flag girl at the start/finish line — waves the green to send the field off.
  const flagGirl = new FlagGirl(scene, track, shadow);

  const input = new InputManager();
  new SetupPanel(setup, (s) => { field.applyPlayerSetup(s); saveSetup(s); });
  const minimap = new Minimap(hud, track);
  const audio = new EngineAudio();

  const status = document.createElement("div");
  status.style.cssText =
    "position:absolute;left:14px;bottom:14px;font:12px/1.5 'Segoe UI',system-ui,sans-serif;color:#dfe7f0;" +
    "background:rgba(0,0,0,0.38);padding:8px 12px;border-radius:8px;min-width:170px;";
  hud.appendChild(status);

  (window as any).__field = field;
  (window as any).__track = track;
  (window as any).__race = race;
  (window as any).__marshals = marshals;

  // --- Game flow state machine ---
  // Show the cinematic attract reel once when the app is first opened this tab session.
  // `?demo` jumps straight into a running race (instant spectate / share / test).
  const demo = location.search.includes("demo");
  const seenAttract = sessionStorage.getItem("rcsprint.seen") === "1";
  let state: State = demo ? "racing" : (seenAttract ? "prerace" : "attract");
  let awarded = false;
  const raceDist = def.laps * track.length;

  const finalize = () => {
    if (awarded) return;
    awarded = true;
    state = "finished";
    const order = race.racers.map((r) => r.name);
    const gained = order.map((_, i) => POINTS[i] ?? 0);
    awardPoints(career, order);
    const finishPos = race.positionOf(player);
    // The season always rolls on to the next (harder) track — no podium gate.
    const canAdvance = round < careerTracks.length - 1;
    if (canAdvance) {
      career.unlocked = Math.max(career.unlocked, round + 1);
    }
    saveCareer(career);
    const isFinale = round >= careerTracks.length - 1;
    const champ = standings(career);
    Screens.results({
      title: `${def.name} — Finished P${finishPos}`,
      order: order.map((name, i) => ({ name, gained: gained[i] })),
      champ,
      isFinale,
      canAdvance,
      finishPos,
      champion: champ[0]?.name,
      onNext: () => { career.round = Math.min(round + 1, careerTracks.length - 1); saveCareer(career); location.reload(); },
      onReplay: () => location.reload(),
      onReset: () => { resetCareer(); location.reload(); },
    });
  };

  const startRacing = () => {
    audio.start(); // Start button is the user gesture that unlocks audio
    Screens.countdown(() => { race.start(performance.now()); state = "racing"; flagGirl.greenFlag(); audio.greenFlag(); });
  };

  scene.executeWhenReady(() => {
    loadingEl.style.display = "none";
    if (state === "racing") {
      race.start(performance.now()); flagGirl.greenFlag(); // ?demo — straight into a live race
    } else if (state === "attract") {
      // Hide the racing HUD; the reel should read as a video, not gameplay.
      hud.style.display = "none";
      fpsEl.style.display = "none";
      Screens.attract(def, () => {
        // Enter the menu with a fresh grid by reloading (the cars have been driving).
        sessionStorage.setItem("rcsprint.seen", "1");
        location.reload();
      });
    } else {
      Screens.preRace(def, round, careerTracks.length, standings(career), startRacing);
    }
    console.log(`[RCSprint] ready — round ${round + 1}: ${def.name} (${state})`);
  });

  const FIXED = 1 / 60; // physics step
  let physAcc = 0;
  let acc = 0;
  scene.onBeforeRenderObservable.add(() => {
    const frameDt = Math.min(0.1, engine.getDeltaTime() / 1000);
    if (state === "racing") {
      const drive = input.sample();
      const raceFraction = Math.min(1, player.progress / raceDist);
      // fixed-timestep accumulator: keeps the sim at real-world speed even when
      // the frame rate dips (does multiple steps per frame to catch up).
      physAcc += frameDt;
      let steps = 0;
      while (physAcc >= FIXED && steps < 6) {
        field.update(FIXED, drive, raceFraction);
        physAcc -= FIXED;
        steps++;
      }
      race.update(performance.now());
      audio.update(field.playerVehicle.speed, drive.throttle, field.playerVehicle.debug.slip);
      if (player.finished) finalize();
    } else if (state === "attract") {
      // Run the AI field on a rubbered-in mid-race surface, drive the cinematic cam.
      physAcc += frameDt;
      let steps = 0;
      while (physAcc >= FIXED && steps < 6) { field.attractUpdate(FIXED, 0.4); physAcc -= FIXED; steps++; }
      const cars = field.cars;
      let fx = 0, fy = 0, fz = 0;
      for (const c of cars) { const p = c.vehicle.position; fx += p.x; fy += p.y; fz += p.z; }
      const focus = new Vector3(fx / cars.length, fy / cars.length, fz / cars.length);
      cine.update(frameDt, focus, field.playerVehicle.position, field.playerVehicle.heading);
    }
    if (state === "racing" || state === "attract") marshals.update(frameDt, field.cars);
    flagGirl.update(frameDt);
    cam.update(field.playerVehicle.position, frameDt);
    scene.activeCamera = state === "attract" ? cine.camera : (aerial ? aerialCam : cam.camera);

    if (state !== "racing") return; // no HUD work outside a live race

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
      minimap.update(field.miniStates());
      const wear = Math.round(field.playerTireWear * 100);
      const gi = race.gapInfo(player, field.playerVehicle.speed);
      const gAhead = gi.ahead == null ? "leader" : `-${gi.ahead.toFixed(1)}s`;
      const gBehind = gi.behind == null ? "—" : `+${gi.behind.toFixed(1)}s`;
      const last = player.lastLap > 0 ? fmt(player.lastLap) : "--";
      status.innerHTML =
        `<b style="color:#ffd34d">${def.name}</b><br>` +
        `<b style="color:#ffd34d">GAP</b> <span style="color:#7fd1ff">&#9650; ${gAhead}</span> &nbsp; <span style="color:#ff9a9a">&#9660; ${gBehind}</span><br>` +
        `<b style="color:#ffd34d">LAST</b> ${last} &nbsp;<span style="color:#9aa6b3">best ${fmt(player.bestLap)}</span><br>` +
        `<b style="color:#ffd34d">TRACK</b> ${field.surface.state} &nbsp;<span style="color:#9aa6b3">tires ${100 - wear}%</span><br>` +
        `<span style="color:#9aa6b3">press <b>G</b> garage &middot; <b>C</b> camera</span>`;
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

boot().catch((e) => {
  console.error("[RCSprint] boot failed", e);
  loadingEl.textContent = "Boot failed — see console";
});
