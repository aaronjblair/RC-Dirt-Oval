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
import { CockpitCamera } from "./core/CockpitCamera";
import { setupEnvironment, SUN_DIR } from "./core/Environment";
import { OvalTrack } from "./track/OvalTrack";
import { buildScenery } from "./track/Scenery";
import { generateCareer } from "./track/tracks";
import { RaceManager } from "./race/RaceManager";
import { Field } from "./race/Field";
import { Marshals } from "./race/Marshals";
import { FlagGirl } from "./race/FlagGirl";
import { buildLawnMower } from "./race/LawnMower";
import { loadSetup, saveSetup } from "./car/CarSetup";
import { SetupPanel } from "./ui/SetupPanel";
import { Screens } from "./ui/Screens";
import { Minimap } from "./ui/Minimap";
import { MotorSound } from "./audio/MotorSound";
import { loadCareer, saveCareer, resetCareer, awardPoints, standings, POINTS, loadPlayerName, savePlayerName, titleCaseName } from "./career/Career";
import { CAR_CLASSES, CAR_CLASS_LIST, loadCarClass, saveCarClass, isCarClassId, type CarClassId } from "./car/CarClass";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const el = (id: string) => document.getElementById(id) as HTMLElement;

// Drive the boot/loading progress bar (app build status — engine → physics → track → ready).
// Havok exposes no byte-level progress, so we advance in stages, smoothed by the bar's CSS transition.
const loadFill = document.getElementById("loadFill") as HTMLDivElement | null;
const loadLabel = document.getElementById("loadLabel") as HTMLDivElement | null;
const setBootProgress = (pct: number, label: string) => {
  if (loadFill) loadFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (loadLabel) loadLabel.textContent = label;
};

const SCALE_MPH = 2.5;
const fmt = (t: number) => (t > 0 ? t.toFixed(2) : "--");

type State = "attract" | "prerace" | "racing" | "finished";

async function boot() {
  setBootProgress(10, "Starting engine…");
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  // Desktop renders at CSS size. Phones (coarse pointer) render at ~2x CSS pixels — sharp on a
  // retina screen without paying for the full 3x device-pixel-ratio (keeps it smooth and crisp).
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const dpr = window.devicePixelRatio || 1;
  // ~2x CSS pixels on retina (sharp), floored at 1.3 so a weaker phone never overloads.
  engine.setHardwareScalingLevel(coarsePointer ? Math.min(1.8, Math.max(1.3, dpr / 2)) : 1);

  const scene = new Scene(engine);
  setBootProgress(20, "Loading physics…");
  const plugin = await initPhysics(scene);
  setBootProgress(50, "Building track…");

  // --- Car class (chosen on the start screen; each class has its own career) ---
  // `?class=sprint|latemodel` overrides the saved choice (dev/preview/share).
  const classParam = new URLSearchParams(location.search).get("class");
  const carClass: CarClassId = isCarClassId(classParam) ? classParam : loadCarClass();
  const carClassDef = CAR_CLASSES[carClass];

  // --- Career round selection (needed up front so night lighting matches the track) ---
  const careerTracks = generateCareer();
  const career = loadCareer(carClass);
  // `?round=N` (1-based) forces a specific career round — a dev/preview affordance
  // (like `?demo`) for eyeballing a given track's backdrop/layout without playing up to it.
  const roundParam = new URLSearchParams(location.search).get("round");
  const round = roundParam != null
    ? Math.min(Math.max(0, parseInt(roundParam, 10) - 1) || 0, careerTracks.length - 1)
    : Math.min(career.round, careerTracks.length - 1);
  const def = careerTracks[round];
  // HARD RULE: RCSprint is set at NIGHT, game-wide (lit lamp towers + crescent moon + starfield).
  // Do NOT ship daytime racing — the night look is the game's identity (see CLAUDE.md). `?day` is a
  // DEV-ONLY preview override; it must never be the shipped default.
  def.night = !new URLSearchParams(location.search).has("day");
  def.fieldSize = 8 + Math.floor(Math.random() * 5); // each race runs a random 8–12-car field

  const cam = new DriverStandCamera(scene, canvas);
  scene.activeCamera = cam.camera;
  const env = setupEnvironment(scene, cam.camera, def.night, !coarsePointer); // desktop gets the quality boost; phones stay lighter

  // Aerial / spectator camera (toggle with C) — high view of the whole oval
  const aerialCam = new UniversalCamera("aerial", new Vector3(0, 105, -55), scene);
  aerialCam.minZ = 0.2; aerialCam.maxZ = 6000; aerialCam.fov = 0.8;
  aerialCam.inputs.clear();
  aerialCam.setTarget(new Vector3(0, 0, 0));

  // Photo camera: a close 3/4 view locked to the player car — a dev/share affordance to actually SEE
  // the car (the screenshot-game skill's "show the car" need). Active only with `?photo`.
  const photoMode = location.search.includes("photo");
  const photoCam = new UniversalCamera("photo", new Vector3(0, 2, 6), scene);
  photoCam.minZ = 0.05; photoCam.maxZ = 6000; photoCam.fov = 0.6;
  photoCam.inputs.clear();
  env.pipeline.addCamera(aerialCam);
  // (the in-car / track / aerial view state + toggle is set up after the field is built, below)

  // Cinematic "broadcast" camera for the opening attract reel
  const cine = new CinematicCamera(scene);
  env.pipeline.addCamera(cine.camera);

  const sun = new DirectionalLight("sun", SUN_DIR, scene);
  sun.position = SUN_DIR.scale(-90);
  sun.intensity = def.night ? 0.25 : 3.4; // moonlight only at night; the lamp towers carry the scene
  if (def.night) sun.diffuse = new Color3(0.5, 0.6, 0.9);
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = def.night ? 0.14 : 0.3;
  ambient.groundColor = def.night ? new Color3(0.06, 0.06, 0.1) : new Color3(0.4, 0.32, 0.24);

  const shadow = new ShadowGenerator(coarsePointer ? 1024 : 2048, sun); // sharper shadows on desktop; phones keep 1024
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 24;
  shadow.darkness = 0.4;
  shadow.bias = 0.0018;
  // Re-render the shadow map every OTHER frame (REFRESHRATE_RENDER_ONEVERYTWOFRAMES = 2): the map
  // covers ~1000 mostly-static casters, so halving its refresh is a big GPU win (esp. mobile) and is
  // visually imperceptible at race speed.
  const shadowMap = shadow.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = 2;

  // --- Build the round ---
  const track = new OvalTrack(scene, plugin, shadow, def);
  const scenery = buildScenery(scene, track, shadow, def.night);
  cam.setStand(scenery.standPosition);
  cam.frameTrack(def); // size the stand camera so the whole oval (+ infield logo) stays in frame

  const setup = loadSetup();
  const race = new RaceManager(track, def.laps);
  const field = new Field(scene, plugin, shadow, track, def, race, setup, carClassDef);
  // Early-career player speed easing: +15% on level 1, tapering to 0 by level 8 (player car only).
  if (round < 7) {
    const boost = 1 + 0.15 * (7 - round) / 7;
    field.player.vehicle.cfg.engineForce *= boost;
  }
  const player = race.racers.find((r) => r.isPlayer)!;
  // Trackside + pit marshals: stand around the track, and right cars that flip.
  const marshals = new Marshals(scene, track, shadow);
  // Flag girl at the start/finish line — waves the green to send the field off.
  const flagGirl = new FlagGirl(scene, track, shadow);
  // Easter egg: a guy on a red riding mower parked on the infield, just below the logo.
  buildLawnMower(scene, shadow, new Vector3(7, -0.02, -2), 0.7);
  setBootProgress(85, "Lighting the night…");

  const input = new InputManager();
  new SetupPanel(setup, (s) => { field.applyPlayerSetup(s); saveSetup(s); }, carClassDef.label);
  const minimap = new Minimap(hud, track);

  // Subtle procedural electric-motor sound for the PLAYER car. Browser autoplay rules require a
  // gesture, so the AudioContext only starts on the first click/keypress. Mute with M / HUD button.
  const motor = new MotorSound();
  motor.setVoiceCount(field.cars.length - 1); // a light, panned whine for every AI car
  (window as any).__audio = motor;
  const muteBtn = document.getElementById("mute") as HTMLButtonElement | null;
  const reflectMute = () => { if (muteBtn) muteBtn.textContent = motor.muted ? "🔇" : "🔊"; };
  reflectMute();
  const toggleMute = () => { motor.toggleMuted(); reflectMute(); };
  muteBtn?.addEventListener("click", toggleMute);
  const typingInField = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  window.addEventListener("keydown", (e) => { if (!typingInField(e) && e.code === "KeyM") toggleMute(); });
  const resumeAudio = () => motor.resume();
  window.addEventListener("pointerdown", resumeAudio, { once: true });
  window.addEventListener("keydown", resumeAudio, { once: true });

  // --- Camera views: in-car (cockpit) / track (driver-stand) / aerial. The upper-left button and V
  //     cycle them; C still quick-toggles aerial. The cockpit rides the player car (parented to its
  //     root) with full post-FX parity, so it looks as polished as the other views. Choice persists. ---
  const cockpit = new CockpitCamera(scene);
  cockpit.attachTo(field.cars[0].root);
  env.pipeline.addCamera(cockpit.camera);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", cockpit.camera); }
  catch { /* SSAO may be unavailable (headless) */ }
  (window as any).__cockpit = cockpit;

  // Photo cam shares the post-FX so close-up shots look like the game.
  env.pipeline.addCamera(photoCam);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", photoCam); }
  catch { /* SSAO may be unavailable (headless) */ }

  type View = "normal" | "incar" | "aerial";
  const VIEW_LABEL: Record<View, string> = { incar: "🎥 In-Car", normal: "📺 Track", aerial: "🚁 Aerial" };
  // The race ALWAYS starts in Track (driver-stand) view; `?view=incar|aerial` is an explicit override
  // (dev/preview + shareable links). The button / V / C still switch the view live during the race.
  const initialView = (): View => {
    const q = new URLSearchParams(location.search).get("view");
    return q === "incar" || q === "aerial" ? q : "normal";
  };
  let view: View = initialView();
  const viewBtn = document.getElementById("view") as HTMLButtonElement | null;
  const reflectView = () => { if (viewBtn) viewBtn.textContent = VIEW_LABEL[view]; };
  const setView = (v: View) => { view = v; reflectView(); };
  reflectView();
  const cycleView = () => setView(view === "normal" ? "incar" : view === "incar" ? "aerial" : "normal");
  viewBtn?.addEventListener("click", cycleView);
  window.addEventListener("keydown", (e) => {
    if (typingInField(e)) return; // don't let V/C fire while typing a driver name
    if (e.code === "KeyV") cycleView();
    else if (e.code === "KeyC") setView(view === "aerial" ? "normal" : "aerial"); // legacy aerial quick-toggle
  });

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
    saveCareer(career, carClass);
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
      onNext: () => { career.round = Math.min(round + 1, careerTracks.length - 1); saveCareer(career, carClass); location.reload(); },
      onReplay: () => location.reload(),
      onReset: () => { resetCareer(carClass); location.reload(); },
    });
  };

  const startRacing = () => {
    // Optional name entry (pre-filled "Super Jay") → personalize the player's leaderboard name.
    Screens.namePrompt(loadPlayerName(), (raw) => {
      const name = titleCaseName(raw);
      savePlayerName(name);
      player.name = name;
      Screens.countdown(() => { race.start(performance.now()); state = "racing"; flagGirl.greenFlag(); });
    });
  };

  scene.executeWhenReady(() => {
    setBootProgress(100, "Ready");
    // Fade the splash out, then remove it from the layout (the bar finishes filling first).
    loadingEl.style.opacity = "0";
    setTimeout(() => { loadingEl.style.display = "none"; }, 360);
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
      // Choose the car class on open, then the pre-race menu. Switching class persists + reloads
      // (so the field rebuilds with the new bodies/config/career), mirroring the attract→menu reload.
      const openMenu = () => Screens.preRace(def, round, careerTracks.length, standings(career), startRacing);
      Screens.classSelect(
        carClass,
        CAR_CLASS_LIST.map((c) => ({ id: c.id, label: c.label, subtitle: c.subtitle })),
        (id) => { if (id !== carClass && isCarClassId(id)) { saveCarClass(id); location.reload(); } else openMenu(); },
      );
    }
    console.log(`[RCSprint] ready — round ${round + 1}: ${def.name} (${state}, ${carClass})`);
  });

  const FIXED = 1 / 60; // physics step
  const RIGHT = new Vector3(1, 0, 0); // local +x, for stereo-panning AI motors relative to the camera
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
      motor.update(drive.throttle, field.playerVehicle.speed); // player-car electric whine
      // Every other car: a light electric whine, stereo-panned + distance-faded to the active camera.
      const camA = scene.activeCamera;
      if (camA) {
        const camPos = camA.globalPosition;
        const camRight = camA.getDirection(RIGHT);
        const vs: { speed: number; throttle: number; pan: number; gain: number }[] = [];
        for (let i = 1; i < field.cars.length; i++) {
          const v = field.cars[i].vehicle;
          const dx = v.position.x - camPos.x, dy = v.position.y - camPos.y, dz = v.position.z - camPos.z;
          const dist = Math.hypot(dx, dy, dz) || 1;
          const pan = (dx * camRight.x + dy * camRight.y + dz * camRight.z) / dist;
          vs.push({ speed: v.speed, throttle: Math.max(0, Math.min(1, v.debug.drive)), pan, gain: Math.max(0, 1 - dist / 70) });
        }
        motor.updateVoices(vs);
      }
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
    if (view === "incar") cockpit.update(frameDt, field.playerVehicle);
    // Ride a flip externally (the driver-stand cam), not a spinning cockpit.
    const incarBlocked = field.playerVehicle.isStuck || field.playerVehicle.isRolling;
    const live = (view === "incar" && !incarBlocked) ? cockpit.camera
      : view === "aerial" ? aerialCam
      : cam.camera;
    scene.activeCamera = state === "attract" ? cine.camera : live;
    if (photoMode) {
      // Lock a close rear-3/4 view onto the player car (shows the spoiler/sail/roof), heading-relative
      // so it frames the car no matter which way it points.
      const pp = field.playerVehicle.position;
      const h = field.playerVehicle.heading;
      const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));
      const right = new Vector3(Math.cos(h), 0, -Math.sin(h));
      const along = location.search.includes("photofront") ? 4.2 : -3.4; // front vs rear 3/4 (dev)
      const eyeY = along > 0 ? 1.0 : 1.5;
      photoCam.position.set(
        pp.x + fwd.x * along + right.x * 2.2,
        pp.y + eyeY,
        pp.z + fwd.z * along + right.z * 2.2,
      );
      photoCam.setTarget(new Vector3(pp.x, pp.y + 0.3, pp.z));
      scene.activeCamera = photoCam;
    }
    status.style.display = view === "aerial" ? "none" : ""; // the lower-left bar blocks the aerial corner

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
