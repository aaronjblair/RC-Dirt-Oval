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
import { CockpitCamera, BUGGY_COCKPIT } from "./core/CockpitCamera";
import { RCProAmCamera } from "./core/RCProAmCamera";
import { setupEnvironment, SUN_DIR } from "./core/Environment";
import { QualityManager } from "./core/QualityManager";
import { MotionBlurPostProcess } from "@babylonjs/core/PostProcesses/motionBlurPostProcess";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import { OvalTrack } from "./track/OvalTrack";
import { buildScenery } from "./track/Scenery";
import { generateCareer } from "./track/tracks";
import { RaceManager } from "./race/RaceManager";
import { Field } from "./race/Field";
import { Marshals } from "./race/Marshals";
import { FlagGirl } from "./race/FlagGirl";
import { buildLawnMower } from "./race/LawnMower";
import { buildPickups } from "./race/Pickups";
import { loadSetup, saveSetup } from "./car/CarSetup";
import { SetupPanel } from "./ui/SetupPanel";
import { Screens } from "./ui/Screens";
import { Minimap } from "./ui/Minimap";
import { MotorSound } from "./audio/MotorSound";
import { loadCareer, saveCareer, resetCareer, awardPoints, standings, POINTS, loadPlayerName, savePlayerName, titleCaseName, exportSave, importSave } from "./career/Career";
import { CAR_CLASSES, CAR_CLASS_LIST, loadCarClass, saveCarClass, isCarClassId, type CarClassId } from "./car/CarClass";
import { ArcadeManager } from "./game/Arcade";
import { loadMode, saveMode, modeFromParam, loadArcadeRun, saveArcadeRun, resetArcadeRun, type GameMode } from "./game/Mode";
import { loadTrackChoice, saveTrackChoice, trackDefFor, loadDayNight, saveDayNight, type TrackChoice } from "./track/TrackSelect";
import { RaceRecorder } from "./replay/Replay";

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

type State = "attract" | "prerace" | "racing" | "finished" | "replay";

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

  // --- Car class: SINGLE-CLASS GAME — always the Sport Mod. The old `?class=` override is gone
  //     (it was the last path to the retired sprint/buggy classes). ---
  const carClass: CarClassId = loadCarClass();
  const carClassDef = CAR_CLASSES[carClass];

  // --- Game mode (chosen on the start screen): "career" (sim championship) or "arcade" (RC Pro-Am
  //     style: on-track pickups, boost strips, collectible letters, slicks, top-3-to-advance + continues).
  //     `?mode=career|arcade` overrides the saved choice. Arcade keeps its own run state (round/continues/score).
  const modeParam = modeFromParam(new URLSearchParams(location.search).get("mode"));
  const gameMode: GameMode = modeParam ?? loadMode();

  // --- Track: SINGLE-TRACK GAME — always the career Dirt Oval. The old `?track=` override
  //     (figure-8 / off-road exhibitions) is gone; those defs remain in code, unreachable. ---
  const trackChoice: TrackChoice = loadTrackChoice();
  const exhibition = trackChoice !== "career";
  const arcadeRun = (gameMode === "arcade" && !exhibition) ? loadArcadeRun() : null;

  // --- Career round selection (needed up front so night lighting matches the track) ---
  const careerTracks = generateCareer();
  const career = loadCareer(carClass);
  // `?round=N` (1-based) forces a specific career round — a dev/preview affordance
  // (like `?demo`) for eyeballing a given track's backdrop/layout without playing up to it.
  const roundParam = new URLSearchParams(location.search).get("round");
  const round = roundParam != null
    ? Math.min(Math.max(0, parseInt(roundParam, 10) - 1) || 0, careerTracks.length - 1)
    : Math.min(arcadeRun ? arcadeRun.round : career.round, careerTracks.length - 1);
  // Exhibition tracks (figure-8 / off-road) use their own stand-alone def; career uses the round.
  const def = trackDefFor(trackChoice) ?? careerTracks[round];
  // Day/night is a PLAYER CHOICE now (the old game-wide forced-night rule is relaxed). `?day`/`?night`
  // are dev/preview overrides; otherwise CAREER re-rolls day/night RANDOMLY each round ("change it up"),
  // while EXHIBITION tracks (figure-8 / off-road) follow the setup-screen Day/Night toggle.
  const dnParams = new URLSearchParams(location.search);
  if (dnParams.has("day")) def.night = false;
  else if (dnParams.has("night")) def.night = true;
  else if (exhibition) { const dn = loadDayNight(); if (dn) def.night = dn === "night"; } // null = keep the def's authored default (off-road night / figure-8 night)
  else def.night = Math.random() < 0.5; // career: random per round, re-rolled each playthrough
  def.fieldSize = 8 + Math.floor(Math.random() * 5); // each race runs a random 8–12-car field

  const cam = new DriverStandCamera(scene, canvas);
  scene.activeCamera = cam.camera;
  const env = setupEnvironment(scene, cam.camera, def.night, !coarsePointer); // desktop gets the quality boost; phones stay lighter

  // Adaptive graphics quality: auto-scales render detail to hold ~60 FPS (desktop starts
  // High, phones Low), climbing toward Ultra when the GPU has headroom. Ticked every frame.
  const quality = new QualityManager(engine, env.pipeline, env.ssao, coarsePointer ? 1 : 3);
  // Restore a pinned pause-menu quality pick ("auto" or a tier index).
  try {
    const savedQ = localStorage.getItem("rcdirtoval.quality");
    if (savedQ && savedQ !== "auto") quality.lockTier(parseInt(savedQ, 10));
  } catch { /* ignore */ }
  // Motion blur is ULTRA-only (desktop): a subtle screen-space blur on the main race cam for
  // sense of speed. Created detached; the tier callback attaches it only on the top rung.
  let mblur: MotionBlurPostProcess | null = null;
  if (!coarsePointer) {
    try {
      const mb = new MotionBlurPostProcess("mblur", scene, 1.0, cam.camera);
      mb.isObjectBased = false; // screen-based: blurs with camera/scene motion, no per-mesh setup
      mb.motionStrength = 0.5;
      mb.motionBlurSamples = 16;
      cam.camera.detachPostProcess(mb);
      mblur = mb;
    } catch { /* motion blur unavailable (weak GPU/headless) — every other effect still applies */ }
  }
  // (the combined tier callback — motion blur / SSR / glow — is wired after all cameras exist, below)
  (window as any).__quality = {
    get tier() { return quality.tier; },
    get locked() { return quality.locked; },
    max: quality.max,
    setTier: (n: number) => quality.setTier(n),
    lockTier: (n: number) => quality.lockTier(n),
    unlock: () => quality.unlock(),
    update: (ms: number, fps?: number) => quality.update(ms, fps),
  };

  // Aerial / spectator camera (toggle with C) — high view of the whole oval
  const aerialCam = new UniversalCamera("aerial", new Vector3(0, 105, -55), scene);
  aerialCam.minZ = 0.2; aerialCam.maxZ = 6000; aerialCam.fov = 0.8;
  aerialCam.inputs.clear();
  aerialCam.setTarget(new Vector3(0, 0, 0));

  // RC Pro-Am overhead camera: the player car stays centred on screen while the track scrolls/rotates
  // around it (world-up fixed, no yaw-follow). Default view in Arcade mode; also a cycleable view.
  const rcProAm = new RCProAmCamera(scene);
  env.pipeline.addCamera(rcProAm.camera);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", rcProAm.camera); }
  catch { /* SSAO may be unavailable (headless) */ }

  // Photo camera: a close 3/4 view locked to the player car — a dev/share affordance to actually SEE
  // the car (the screenshot-game skill's "show the car" need). Active only with `?photo`.
  const photoMode = location.search.includes("photo");
  const photoCam = new UniversalCamera("photo", new Vector3(0, 2, 6), scene);
  photoCam.minZ = 0.05; photoCam.maxZ = 6000; photoCam.fov = 0.6;
  photoCam.inputs.clear();
  env.pipeline.addCamera(aerialCam);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", aerialCam); }
  catch { /* SSAO may be unavailable (headless) */ }
  // (the in-car / track / aerial view state + toggle is set up after the field is built, below)

  // Cinematic "broadcast" camera for the opening attract reel
  const cine = new CinematicCamera(scene);
  env.pipeline.addCamera(cine.camera);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", cine.camera); }
  catch { /* SSAO may be unavailable (headless) */ }

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
  // Career grids the field in the PREVIOUS race's finishing order (winner on pole). Exhibition
  // (figure-8 / off-road) and arcade always start in the default identity order.
  const gridSeed = (!exhibition && gameMode === "career") ? career.lastRaceOrder : undefined;
  const field = new Field(scene, plugin, shadow, track, def, race, setup, carClassDef, gridSeed);
  // Early-career player speed easing: +15% on level 1, tapering to 0 by level 8 (player car only).
  // Career only — exhibition (figure-8 / off-road) races run on the pristine class baseline.
  if (!exhibition && round < 7) {
    const boost = 1 + 0.15 * (7 - round) / 7;
    field.setPlayerEngineBoost(boost); // survives garage re-apply (applyPlayerSetup re-folds it in)
  }
  const player = race.racers.find((r) => r.isPlayer)!;
  // Records every car's pose each physics step for the post-race REPLAY.
  const recorder = new RaceRecorder(field.cars);
  // Trackside + pit marshals: stand around the track, and right cars that flip.
  const marshals = new Marshals(scene, track, shadow);
  // Flag girl at the start/finish line — waves the green to send the field off.
  const flagGirl = new FlagGirl(scene, track, shadow);
  // Easter egg: a guy on a red riding mower parked on the infield, just below the logo.
  buildLawnMower(scene, shadow, new Vector3(7, -0.02, -2), 0.7);
  // Tailgate-party pickup trucks: backed in behind the grandstand/building and along the east straight.
  buildPickups(scene, shadow, scenery.standPosition);

  // Arcade (RC Pro-Am) mode: lay pickups / boost strips / collectible letters / oil slicks on the
  // oval. Only built in arcade mode; career/sim races never see them. Updated each frame while racing.
  const arcade = (gameMode === "arcade" && !exhibition) ? new ArcadeManager(scene, track, shadow) : null;
  (window as any).__arcade = arcade;
  if (arcade) { const ah = document.getElementById("arcadeHud"); if (ah) ah.style.display = "flex"; }
  setBootProgress(85, "Lighting the night…");

  const input = new InputManager();
  // Auto-throttle: when on, the car runs FULL THROTTLE always and the only input is steering (the
  // touch GAS/BRAKE pedals are hidden). Persisted; toggled on the setup screen. Desktop + mobile.
  let autoThrottle = localStorage.getItem("rcdirtoval.autothrottle") === "1";
  input.setAutoThrottle(autoThrottle);
  new SetupPanel(setup, (s) => { field.applyPlayerSetup(s); saveSetup(s); }, carClassDef.label);
  const minimap = new Minimap(hud, track);

  // Subtle procedural electric-motor sound for the PLAYER car. Browser autoplay rules require a
  // gesture, so the AudioContext only starts on the first click/keypress. Mute with M / HUD button.
  const motor = new MotorSound();
  motor.setVoiceCount(field.cars.length - 1); // a light, panned whine for every AI car
  (window as any).__audio = motor;
  const muteBtn = document.getElementById("mute") as HTMLButtonElement | null;
  const keycap = (k: string) => (coarsePointer ? "" : `<span class="keycap">${k}</span>`);
  const reflectMute = () => { if (muteBtn) muteBtn.innerHTML = (motor.muted ? "🔇" : "🔊") + keycap("M"); };
  reflectMute();
  const toggleMute = () => { motor.toggleMuted(); reflectMute(); };
  muteBtn?.addEventListener("click", toggleMute);
  // Menu sound enable/disable: turning sound ON also resumes the audio context (a button click is a
  // user gesture), so toggling it on a menu makes sound start even if it never did. Returns muted.
  const menuToggleSound = () => { if (motor.muted) motor.enable(); else motor.setMuted(true); reflectMute(); return motor.muted; };
  const typingInField = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  window.addEventListener("keydown", (e) => { if (!typingInField(e) && e.code === "KeyM") toggleMute(); });
  // Resume audio on ANY user gesture (resume() is idempotent + cheap once started). Not `{once:true}`
  // — the very first gesture can land on a menu before the context is ready, so keep retrying until
  // the oscillators actually start.
  const resumeAudio = () => motor.resume();
  window.addEventListener("pointerdown", resumeAudio);
  window.addEventListener("keydown", resumeAudio);

  // --- Camera views: in-car (cockpit) / track (driver-stand) / aerial. The upper-left button and V
  //     cycle them; C still quick-toggles aerial. The cockpit rides the player car (parented to its
  //     root) with full post-FX parity, so it looks as polished as the other views. Choice persists. ---
  const cockpit = new CockpitCamera(scene, carClass === "buggy" ? BUGGY_COCKPIT : undefined);
  cockpit.attachTo(field.cars[0].root);
  env.pipeline.addCamera(cockpit.camera);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", cockpit.camera); }
  catch { /* SSAO may be unavailable (headless) */ }
  (window as any).__cockpit = cockpit;

  // Photo cam shares the post-FX so close-up shots look like the game.
  env.pipeline.addCamera(photoCam);
  try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", photoCam); }
  catch { /* SSAO may be unavailable (headless) */ }

  // --- Premium-FX tier gating (one combined callback — setTierCallback REPLACES, so all gates
  //     live here): Ultra ⇒ motion blur; High+ ⇒ SSR reflections; Min ⇒ glow layer off. ---
  const ssrCams = [cam.camera, cockpit.camera, photoCam, cine.camera];
  if (env.ssr) {
    // constructed attached to the stand cam only — bring the other hero cams in
    try { scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssr", [cockpit.camera, photoCam, cine.camera]); }
    catch { /* SSR may be unavailable */ }
  }
  let mbOn = false, ssrOn = true;
  const applyTierFx = (tier: number) => {
    if (mblur) {
      const want = tier >= 4;
      if (want !== mbOn) {
        mbOn = want;
        if (want) cam.camera.attachPostProcess(mblur);
        else cam.camera.detachPostProcess(mblur);
      }
    }
    if (env.ssr) {
      const want = tier >= 3;
      if (want !== ssrOn) {
        ssrOn = want;
        try {
          if (want) scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssr", ssrCams);
          else scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssr", ssrCams);
        } catch { /* ignore */ }
      }
    }
    if (env.glow) env.glow.isEnabled = tier >= 1;
  };
  quality.setTierCallback(applyTierFx);
  applyTierFx(quality.tier); // reconcile with the starting tier immediately

  // --- Cinematic depth-of-field: photo mode / replay / the intro hero shot only (never racing).
  //     Focus distance tracks the player car each frame in the render loop. ---
  env.pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Medium;
  env.pipeline.depthOfField.fStop = 1.6;
  env.pipeline.depthOfField.focalLength = 80; // mm

  type View = "normal" | "incar" | "aerial" | "topdown";
  const VIEW_LABEL: Record<View, string> = { incar: "🎥 In-Car", normal: "📺 Track", aerial: "🚁 Aerial", topdown: "🎮 RC Pro-Am" };
  // The race ALWAYS starts in Track (driver-stand) view; `?view=incar|aerial` is an explicit override
  // (dev/preview + shareable links). The button / V / C still switch the view live during the race.
  const initialView = (): View => {
    const q = new URLSearchParams(location.search).get("view");
    if (q === "incar" || q === "aerial" || q === "topdown") return q;
    // Arcade mode defaults to the RC Pro-Am overhead perspective; career defaults to the stand cam.
    return gameMode === "arcade" ? "topdown" : "normal";
  };
  let view: View = initialView();
  const viewBtn = document.getElementById("view") as HTMLButtonElement | null;
  const reflectView = () => { if (viewBtn) viewBtn.innerHTML = VIEW_LABEL[view] + keycap("V"); };
  const setView = (v: View) => { view = v; reflectView(); };
  reflectView();
  const cycleView = () => setView(view === "normal" ? "incar" : view === "incar" ? "aerial" : view === "aerial" ? "topdown" : "normal");
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
  const seenAttract = (sessionStorage.getItem("rcdirtoval.seen") ?? sessionStorage.getItem("rcsprint.seen")) === "1";
  let state: State = demo ? "racing" : (seenAttract ? "prerace" : "attract");
  // Opening "photo" intro: the #32 + 11X parked nose-to-tail in a held side view before the
  // attract reel rolls. introHold counts down; the hidden rest-of-field is restored after.
  let introHold = 0;
  let introHidden: Array<{ root: { setEnabled(b: boolean): void } }> = [];
  let awarded = false;
  let victoryShown = false; // the winner's-photo overlay has been shown for this race
  const raceDist = def.laps * track.length;
  // ROLLING START: the whole field (player included) rolls off the grid AI-driven in formation;
  // the moment the FIRST car crosses the start/finish line the green flies and the player takes
  // control. Replaces the old drag-strip light tree / standing start (and its perfect-launch boost).
  let rolling = false;

  // --- Manual camera zoom (all views) + Pause (P / ⏸) ---
  // Arcade (RC Pro-Am) starts ZOOMED OUT ~25% for more track context; Career/Sim starts at normal zoom.
  let zoom = gameMode === "arcade" ? 0.8 : 1.0; // 1 = default, <1 = out, >1 = in; player can zoom anytime
  const clampZoom = (z: number) => Math.max(0.5, Math.min(3.0, z));
  const ZOOM_STEP = 0.12;
  window.addEventListener("wheel", (e) => {
    if (state === "attract") return; // the attract reel drives its own cinematic cam
    e.preventDefault();
    zoom = clampZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (typingInField(e) || state === "attract") return;
    if (e.code === "Equal" || e.code === "NumpadAdd") zoom = clampZoom(zoom + ZOOM_STEP);
    else if (e.code === "Minus" || e.code === "NumpadSubtract") zoom = clampZoom(zoom - ZOOM_STEP);
  });
  input.onZoom = (d) => { zoom = clampZoom(zoom + d); }; // on-screen +/- buttons (touch)

  // Pause: freezes the sim + race clock + engine sound; the scene keeps drawing. P key + ⏸ HUD button.
  // While paused a menu offers Resume / Restart / Main Menu.
  let paused = false;
  let pausedAccum = 0; // ms spent paused, subtracted from the race clock so lap timing stays honest
  let pauseStart = 0;
  let pauseMenuEl: HTMLDivElement | null = null;
  const pauseBtn = document.getElementById("pause") as HTMLButtonElement | null;
  const setPaused = (p: boolean) => {
    if (state !== "racing" || p === paused) return;
    paused = p;
    if (paused) pauseStart = performance.now();
    else pausedAccum += performance.now() - pauseStart;
    motor.setPaused(paused);
    if (pauseBtn) pauseBtn.textContent = paused ? "▶" : "⏸";
    if (paused) {
      // Graphics label helpers: "AUTO (High)" while adaptive, or a pinned tier name when locked.
      const Q_NAMES = ["MIN", "LOW", "MED", "HIGH", "ULTRA"];
      const qLabel = () => (quality.locked ? Q_NAMES[quality.tier] : `AUTO (${Q_NAMES[quality.tier]})`);
      pauseMenuEl = Screens.pauseMenu({
        onResume: () => setPaused(false),
        onRestart: () => { sessionStorage.setItem("rcdirtoval.autostart", "1"); location.reload(); }, // fresh race, same settings
        onMenu: () => { location.reload(); }, // back to the setup screen (career progress kept)
        muted: motor.muted,
        onToggleSound: () => { if (motor.muted) motor.enable(); else motor.setMuted(true); reflectMute(); return motor.muted; },
        autoThrottle,
        onToggleAuto: () => {
          autoThrottle = !autoThrottle;
          try { localStorage.setItem("rcdirtoval.autothrottle", autoThrottle ? "1" : "0"); } catch { /* ignore */ }
          input.setAutoThrottle(autoThrottle);
          return autoThrottle;
        },
        qualityLabel: qLabel(),
        onCycleQuality: () => {
          // Cycle AUTO → MIN → LOW → MED → HIGH → ULTRA → AUTO. Manual picks pin the tier
          // (the FPS controller stands down) and persist; AUTO unpins it.
          if (!quality.locked) quality.lockTier(0);
          else if (quality.tier < quality.max) quality.lockTier(quality.tier + 1);
          else quality.unlock();
          try { localStorage.setItem("rcdirtoval.quality", quality.locked ? String(quality.tier) : "auto"); } catch { /* ignore */ }
          return qLabel();
        },
        viewLabel: VIEW_LABEL[view].replace(/^\S+\s/, ""), // strip the emoji, keep the name
        onCycleView: () => { cycleView(); return VIEW_LABEL[view].replace(/^\S+\s/, ""); },
      });
    } else if (pauseMenuEl) { pauseMenuEl.remove(); pauseMenuEl = null; }
  };
  const togglePause = () => setPaused(!paused);
  pauseBtn?.addEventListener("click", togglePause);
  window.addEventListener("keydown", (e) => { if (!typingInField(e) && e.code === "KeyP") togglePause(); });

  // --- Post-race REPLAY playback ---
  let replayCursor = 0;      // playhead in recorded frames
  let replayPlaying = true;
  let replaySpeed = 1;
  let replayCamMode: "cine" | "aerial" = "cine";
  const replayFocus = new Vector3();
  let replayCtl: { setPlayhead: (frac: number, playing: boolean) => void; remove: () => void } | null = null;
  const startReplay = (reopen: () => void) => {
    if (!recorder.hasData) { reopen(); return; }
    state = "replay";
    hud.style.display = "none";
    replayCursor = 0; replayPlaying = true; replaySpeed = 1; replayCamMode = "cine";
    motor.setPaused(true); // the cars aren't really driving — keep the engine voice quiet during playback
    replayCtl = Screens.replayControls({
      duration: recorder.seconds,
      onPlayPause: () => { replayPlaying = !replayPlaying; if (replayPlaying && replayCursor >= recorder.count - 1) replayCursor = 0; return replayPlaying; },
      onSeek: (frac) => { replayCursor = frac * (recorder.count - 1); },
      onSpeed: () => { replaySpeed = replaySpeed >= 2 ? 0.5 : replaySpeed === 1 ? 2 : 1; return replaySpeed; },
      onCamera: () => { replayCamMode = replayCamMode === "cine" ? "aerial" : "cine"; return replayCamMode; },
      onDone: () => { replayCtl?.remove(); replayCtl = null; state = "finished"; hud.style.display = ""; motor.setPaused(false); reopen(); },
    });
  };

  const finalize = () => {
    if (awarded) return;
    awarded = true;
    state = "finished";
    const order = race.racers.map((r) => r.name);
    const gained = order.map((_, i) => POINTS[i] ?? 0);
    const finishPos = race.positionOf(player);

    // Player WON — show the winner's photo first (every mode); the results flow resumes
    // only when CONTINUE is clicked (finalize re-enters with the flag set).
    if (finishPos === 1 && !victoryShown) {
      victoryShown = true;
      awarded = false; // allow the re-entry to run the real finalize body
      Screens.victory(() => finalize());
      return;
    }

    // --- Exhibition (figure-8 / off-road): a single stand-alone race — no career points, no arcade
    //     run-state. Just show the finish + offer a replay or back to the menu. ---
    if (exhibition) {
      const showRes = () => Screens.results({
        title: `${def.name} — Finished P${finishPos}`,
        order: order.map((name, i) => ({ name, gained: gained[i] })),
        champ: [],
        isFinale: true,   // hide the "next round" button + podium-lock note
        canAdvance: false,
        finishPos,
        onNext: () => location.reload(),
        onReplay: () => location.reload(),
        onReset: () => location.reload(),
        onWatchReplay: recorder.hasData ? () => startReplay(showRes) : undefined,
        muted: motor.muted, onToggleSound: menuToggleSound,
      });
      showRes();
      return;
    }

    // --- Arcade mode: finish top-3 to advance; otherwise burn a continue. Score accrues across the run. ---
    if (gameMode === "arcade" && arcadeRun && arcade) {
      arcadeRun.score += arcade.getScore() + Math.max(0, race.racers.length - finishPos + 1) * 10;
      const lastTrack = round >= careerTracks.length - 1;
      const advanced = finishPos <= 3;
      if (advanced && !lastTrack) arcadeRun.round = round + 1;
      else if (!advanced) arcadeRun.continues -= 1;
      const eliminated = arcadeRun.continues < 0;
      if (eliminated) resetArcadeRun(); else saveArcadeRun(arcadeRun);
      const outcome = eliminated ? "GAME OVER — out of continues"
        : advanced ? (lastTrack ? "ARCADE COMPLETE!" : `Top 3 — advancing to race ${round + 2}`)
        : `Missed top 3 — continue used (${arcadeRun.continues} left)`;
      const showRes = () => Screens.results({
        title: `${def.name} — P${finishPos} · ${outcome}`,
        order: order.map((name, i) => ({ name, gained: gained[i] })),
        champ: [],
        isFinale: lastTrack || eliminated,
        canAdvance: advanced && !lastTrack,
        finishPos,
        onNext: () => location.reload(), // arcadeRun already advanced + saved (or reset on elimination)
        onReplay: () => location.reload(),
        onReset: () => { resetArcadeRun(); location.reload(); },
        onWatchReplay: recorder.hasData ? () => startReplay(showRes) : undefined,
        muted: motor.muted, onToggleSound: menuToggleSound,
      });
      showRes();
      return;
    }

    awardPoints(career, order);
    // Remember this race's finishing order (as stable IDENTITY INDICES from the racer id — "player"=0,
    // "ai{i}"={i}) so the NEXT race grids the field in that order (previous winner on pole). Index-keyed
    // so renaming a driver between rounds can't misplace anyone. race.racers is already finish-sorted.
    career.lastRaceOrder = race.racers.map((r) => (r.id === "player" ? 0 : parseInt(r.id.slice(2), 10)));
    // The season always rolls on to the next (harder) track — no podium gate.
    const canAdvance = round < careerTracks.length - 1;
    if (canAdvance) {
      career.unlocked = Math.max(career.unlocked, round + 1);
    }
    saveCareer(career, carClass);
    const isFinale = round >= careerTracks.length - 1;
    const champ = standings(career);
    const showRes = () => Screens.results({
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
      onWatchReplay: recorder.hasData ? () => startReplay(showRes) : undefined,
      muted: motor.muted, onToggleSound: menuToggleSound,
    });
    showRes();
  };

  // ROLLING START: the field pulls away AI-driven; the green (and player control) comes when the
  // leader crosses the start/finish line — handled in the render loop via field.checkLineCross().
  const flashBanner = (text: string, color: string, holdMs: number) => {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:30;pointer-events:none;" +
      `font-family:'Segoe UI',system-ui,sans-serif;font-size:64px;font-weight:900;letter-spacing:3px;color:${color};` +
      "text-shadow:0 4px 20px rgba(0,0,0,0.85);transition:opacity 400ms;";
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => { d.style.opacity = "0"; setTimeout(() => d.remove(), 450); }, holdMs);
  };
  const launchRace = () => {
    state = "racing"; rolling = true;
    track.resetGroove(); pausedAccum = 0; paused = false;
    flashBanner("ROLLING START", "#ffd34d", 2200);
  };
  const dropGreen = () => {
    rolling = false;
    race.start(performance.now());
    flagGirl.greenFlag();
    flashBanner("GREEN GREEN GREEN", "#6dff7a", 1600);
  };

  scene.executeWhenReady(() => {
    setBootProgress(100, "Ready");
    // Fade the splash out, then remove it from the layout (the bar finishes filling first).
    loadingEl.style.opacity = "0";
    setTimeout(() => { loadingEl.style.display = "none"; }, 360);
    if (state === "racing") {
      race.start(performance.now()); flagGirl.greenFlag(); track.resetGroove(); // ?demo — straight into a live race
    } else if (state === "attract") {
      // Hide the racing HUD; the reel should read as a video, not gameplay.
      hud.style.display = "none";
      fpsEl.style.display = "none";
      // INTRO PHOTO: park the 11X directly behind the #32 (same heading) on the front stretch and
      // hold a pure side view of the pair for a few seconds before the demo action starts.
      const c32 = field.cars[0], c11 = field.cars[1];
      if (c11) {
        introHidden = field.cars.slice(2);
        introHidden.forEach((c) => c.root.setEnabled(false));
        const yaw = field.playerVehicle.heading;
        const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const parked = c32.vehicle.position.subtract(fwd.scale(3.4));
        c11.vehicle.resetTo(parked, yaw); // physics agrees with the visual when the reel starts
        // the vehicle only syncs its mesh on update() (skipped during the hold) — move the root too
        if (c11.root.rotationQuaternion && c32.root.rotationQuaternion) c11.root.rotationQuaternion.copyFrom(c32.root.rotationQuaternion);
        else c11.root.rotation.copyFrom(c32.root.rotation);
        c11.root.position.copyFrom(parked);
        c11.root.position.y = c32.root.position.y;
        const mid = c32.vehicle.position.add(parked).scale(0.5);
        const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        // Raised, level framing (user-verified): both cars fully visible in the upper-middle
        // of the frame, clear of the title text below.
        aerialCam.position.copyFrom(mid.subtract(right.scale(8.2)));
        aerialCam.position.y = mid.y + 2.1;
        aerialCam.setTarget(mid.add(new Vector3(0, -0.25, 0))); // slight down-aim lifts the pair above the title on short screens too
        introHold = 4.5;
      }
      Screens.attract(def, () => {
        // Enter the menu with a fresh grid by reloading (the cars have been driving).
        sessionStorage.setItem("rcdirtoval.seen", "1");
        location.reload();
      });
    } else if (sessionStorage.getItem("rcdirtoval.autostart") === "1") {
      // Returned from a class/mode change or a Restart — skip the menu and drop the green.
      sessionStorage.removeItem("rcdirtoval.autostart");
      launchRace();
    } else {
      // ONE unified setup screen: driver name + car class + game mode + sound, then START.
      // Changing class or mode persists + reloads (the field/career/arcade rebuild) and auto-starts.
      Screens.setup({
        def, round, total: careerTracks.length, champ: standings(career),
        name: loadPlayerName(),
        classes: CAR_CLASS_LIST.map((c) => ({ id: c.id, label: c.label, subtitle: c.subtitle })),
        currentClass: carClass, currentMode: gameMode, currentTrack: trackChoice, currentTime: def.night ? "night" : "day", muted: motor.muted, autoThrottle,
        onExportSave: exportSave,
        onImportSave: importSave,
        onStart: (sel) => {
          motor.resume(); // START is a user gesture — make sure the audio context is live
          const nm = titleCaseName(sel.name); savePlayerName(nm); player.name = nm;
          if (sel.muted !== motor.muted) { motor.setMuted(sel.muted); reflectMute(); }
          autoThrottle = sel.auto;
          try { localStorage.setItem("rcdirtoval.autothrottle", sel.auto ? "1" : "0"); } catch { /* ignore */ }
          input.setAutoThrottle(autoThrottle);
          const classChanged = isCarClassId(sel.classId) && sel.classId !== carClass;
          // Time-of-day only matters for EXHIBITION tracks (career re-rolls it randomly per round and
          // ignores the toggle). Only persist + treat as a change for exhibition, so a career start
          // never writes the exhibition pref or forces a needless reload.
          const curTime = def.night ? "night" : "day";
          const timeChanged = exhibition && sel.time !== curTime;
          if (exhibition) saveDayNight(sel.time);
          // Changing class, mode, track, OR (exhibition) time of day persists the pick + reloads so
          // the field/track/career/lighting rebuild, then autostarts straight into the race.
          if (classChanged || sel.mode !== gameMode || sel.track !== trackChoice || timeChanged) {
            if (isCarClassId(sel.classId)) saveCarClass(sel.classId);
            saveMode(sel.mode);
            saveTrackChoice(sel.track);
            // Drop the dev-override query params (?track/class/mode/day/night) before reloading —
            // location.reload() keeps the query string, and those params would otherwise SHADOW the
            // freshly-saved menu pick (e.g. a stale ?track=offroad would re-race off-road). Keep
            // ?demo/?round/?view dev affordances intact.
            const u = new URL(location.href);
            ["track", "class", "mode", "day", "night"].forEach((k) => u.searchParams.delete(k));
            history.replaceState(null, "", u.toString());
            sessionStorage.setItem("rcdirtoval.autostart", "1");
            location.reload();
          } else {
            launchRace();
          }
        },
      });
    }
    console.log(`[Super Jay RC] ready — round ${round + 1}: ${def.name} (${state}, ${carClass}, ${gameMode})`);
  });

  const FIXED = 1 / 60; // physics step
  const RIGHT = new Vector3(1, 0, 0); // local +x, for stereo-panning AI motors relative to the camera
  let physAcc = 0;
  let acc = 0;
  let prevCamPos: { x: number; z: number } | null = null; // last frame's listener position (Doppler relative-velocity)
  scene.onBeforeRenderObservable.add(() => {
    const frameDt = Math.min(0.1, engine.getDeltaTime() / 1000);
    if (state === "racing" && !paused) {
      const drive = input.sample();
      if (autoThrottle) { drive.throttle = 1; drive.brake = 0; } // full throttle, steering only
      const raceFraction = Math.min(1, player.progress / raceDist);
      // fixed-timestep accumulator: keeps the sim at real-world speed even when
      // the frame rate dips (does multiple steps per frame to catch up).
      physAcc += frameDt;
      let steps = 0;
      while (physAcc >= FIXED && steps < 6) {
        // ROLLING START: until the leader crosses the line the WHOLE field (player included) is
        // AI-driven in formation; the first forward crossing drops the green + hands over control.
        if (rolling) {
          field.attractUpdate(FIXED, raceFraction);
          if (field.checkLineCross()) dropGreen();
        } else {
          field.update(FIXED, drive, raceFraction);
        }
        recorder.record(); // capture this step's poses for the post-race replay
        physAcc -= FIXED;
        steps++;
      }
      race.update(performance.now() - pausedAccum);
      track.updateGroove(field.cars, frameDt); // darken the driven-in racing groove (visual only, ≤40%)
      if (arcade) arcade.update(frameDt, field); // pickups / boost strips / letters / slicks
      // player-car engine voice (while rolling the AI is on the pedal — approximate from speed)
      motor.update(rolling ? Math.min(1, field.playerVehicle.speed / 10) : drive.throttle, field.playerVehicle.speed);
      // Every other car: a light electric whine, stereo-panned + distance-faded to the active camera.
      const camA = scene.activeCamera;
      if (camA) {
        const camPos = camA.globalPosition;
        const camRight = camA.getDirection(RIGHT);
        // Listener (camera) velocity by finite difference — the in-car / RC-Pro-Am cams ride
        // the player car, so Doppler must use RELATIVE velocity or side-by-side pack mates
        // would get a phantom pitch bend from their own absolute speed.
        let cvx = 0, cvz = 0;
        if (prevCamPos && frameDt > 1e-4) {
          cvx = (camPos.x - prevCamPos.x) / frameDt;
          cvz = (camPos.z - prevCamPos.z) / frameDt;
        }
        prevCamPos = { x: camPos.x, z: camPos.z };
        const vs: { speed: number; throttle: number; pan: number; gain: number; closing: number }[] = [];
        for (let i = 1; i < field.cars.length; i++) {
          const v = field.cars[i].vehicle;
          const dx = v.position.x - camPos.x, dy = v.position.y - camPos.y, dz = v.position.z - camPos.z;
          const dist = Math.hypot(dx, dy, dz) || 1;
          const pan = (dx * camRight.x + dy * camRight.y + dz * camRight.z) / dist;
          // closing speed toward the camera (+ = approaching) → a small Doppler bend on the voice
          const closing = -((v.velX - cvx) * dx + (v.velZ - cvz) * dz) / dist;
          vs.push({ speed: v.speed, throttle: Math.max(0, Math.min(1, v.debug.drive)), pan, gain: Math.max(0, 1 - dist / 70), closing });
        }
        motor.updateVoices(vs);
      }
      if (race.state.finished) finalize(); // race ends one lap after the winner crosses
    } else if (state === "attract") {
      if (introHold > 0) {
        // Held intro photo — the pair sit parked; the reel starts when the hold expires.
        introHold -= frameDt;
        if (introHold <= 0) { introHidden.forEach((c) => c.root.setEnabled(true)); introHidden = []; }
      } else {
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
    } else if (state === "replay") {
      // Drive every car from the recorded poses; advance the playhead when playing.
      if (replayPlaying) {
        replayCursor += frameDt * 60 * replaySpeed;
        if (replayCursor >= recorder.count - 1) { replayCursor = recorder.count - 1; replayPlaying = false; }
      }
      recorder.apply(replayCursor, frameDt * replaySpeed);
      recorder.posAt(0, replayCursor, replayFocus); // the player car is the cinematic hero
      const rh = recorder.headingAt(0, replayCursor);
      cine.update(frameDt, replayFocus, replayFocus, rh);
      if (replayCtl) replayCtl.setPlayhead(replayCursor / Math.max(1, recorder.count - 1), replayPlaying);
    }
    if ((state === "racing" && !paused) || state === "attract") marshals.update(frameDt, field.cars);
    flagGirl.update(frameDt);
    if (state === "replay") {
      // Replay drives its own camera (cinematic broadcast, or the aerial whole-track view).
      aerialCam.fov = 0.8 / zoom;
      scene.activeCamera = replayCamMode === "aerial" ? aerialCam : cine.camera;
    } else {
      cam.update(field.playerVehicle.position, frameDt, zoom);
      if (view === "incar") cockpit.update(frameDt, field.playerVehicle, zoom);
      if (view === "topdown") rcProAm.update(field.playerVehicle.position);
      aerialCam.fov = 0.8 / zoom;      // manual zoom for the aerial view
      rcProAm.camera.fov = 0.8 / zoom; // ...and the RC Pro-Am overhead view
      // Ride a flip externally (the driver-stand cam), not a spinning cockpit.
      const incarBlocked = field.playerVehicle.isStuck || field.playerVehicle.isRolling;
      const live = (view === "incar" && !incarBlocked) ? cockpit.camera
        : view === "aerial" ? aerialCam
        : view === "topdown" ? rcProAm.camera
        : cam.camera;
      scene.activeCamera = state === "attract" ? (introHold > 0 ? aerialCam : cine.camera) : live;
    }
    // Cinematic DoF only in photo mode / replay / the intro hero shot — racing stays crisp.
    const wantDof = photoMode || state === "replay" || (state === "attract" && introHold > 0);
    if (env.pipeline.depthOfFieldEnabled !== wantDof) env.pipeline.depthOfFieldEnabled = wantDof;
    if (wantDof && scene.activeCamera) {
      const camPos = scene.activeCamera.globalPosition;
      const pp = field.playerVehicle.position;
      const dx = camPos.x - pp.x, dy = camPos.y - pp.y, dz = camPos.z - pp.z;
      env.pipeline.depthOfField.focusDistance = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000; // mm
    }
    if (photoMode) {
      // Lock a close rear-3/4 view onto the player car (shows the spoiler/sail/roof), heading-relative
      // so it frames the car no matter which way it points.
      const pp = field.playerVehicle.position;
      const h = field.playerVehicle.heading;
      const fwd = new Vector3(Math.sin(h), 0, Math.cos(h));
      const right = new Vector3(Math.cos(h), 0, -Math.sin(h));
      if (location.search.includes("photoside")) {
        // pure side profile (dev) — full nose→roof→sail→spoiler silhouette
        photoCam.position.set(pp.x + right.x * 5.2, pp.y + 0.7, pp.z + right.z * 5.2);
        photoCam.setTarget(new Vector3(pp.x, pp.y + 0.35, pp.z));
      } else {
        const front = location.search.includes("photofront");
        const low = location.search.includes("photolow"); // lower, more side-on rear (dev)
        const along = front ? 4.2 : -3.4; // front vs rear 3/4 (dev)
        const eyeY = low ? 0.8 : (front ? 1.0 : 1.5);
        const side = low ? 2.8 : 2.2;
        photoCam.position.set(
          pp.x + fwd.x * along + right.x * side,
          pp.y + eyeY,
          pp.z + fwd.z * along + right.z * side,
        );
        photoCam.setTarget(new Vector3(pp.x, pp.y + 0.3, pp.z));
      }
      scene.activeCamera = photoCam;
    }
    // Hide the lower-left info bar in the aerial view (it blocks the corner) AND on touch devices
    // (the GAS pedal now lives bottom-left and would sit under it).
    status.style.display = (coarsePointer || view === "aerial") ? "none" : "";

    // Adaptive graphics quality runs every frame (every state), not just during a race.
    quality.update(engine.getDeltaTime());

    // always-on running leaderboard (top-right, under the minimap) — built lazily once
    let lbEl = document.getElementById("leaderb");
    if (!lbEl) {
      lbEl = document.createElement("div");
      lbEl.id = "leaderb";
      lbEl.style.cssText =
        "position:fixed;right:12px;top:232px;z-index:30;background:rgba(10,12,16,.62);" +
        "border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px 10px;" +
        "font:11px/1.55 system-ui,sans-serif;color:#dfe6ee;min-width:150px;display:none;pointer-events:none";
      document.body.appendChild(lbEl);
    }
    lbEl.style.display = state === "racing" ? "block" : "none";

    if (state !== "racing") return; // no HUD work outside a live race

    acc += engine.getDeltaTime();
    if (acc > 90) {
      acc = 0;
      const now = performance.now() - pausedAccum;
      fpsEl.textContent = `${engine.getFps().toFixed(0)} fps`;
      el("hudSpeed").textContent = `${Math.round(field.playerVehicle.speed * SCALE_MPH)}`;
      el("hudLap").innerHTML = `${Math.max(1, player.lap)}<small>/${def.laps}</small>`;
      el("hudPos").innerHTML = `${race.positionOf(player)}<small>/${race.racers.length}</small>`;
      el("hudTime").textContent = fmt(race.curLapTime(player, now));
      el("hudBest").textContent = fmt(player.bestLap);
      minimap.update(field.miniStates());
      el("leaderb").innerHTML = race.racers
        .map((r, i) => `<div style="${r.isPlayer ? "color:#ffd34d;font-weight:700" : ""}">P${i + 1}&nbsp; ${r.name}</div>`)
        .join("");
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
      if (arcade && arcadeRun) {
        el("arcScore").textContent = `${arcadeRun.score + arcade.getScore()}`;
        el("arcCont").textContent = `${arcadeRun.continues}`;
      }
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

boot().catch((e) => {
  console.error("[Super Jay RC] boot failed", e);
  loadingEl.textContent = "Boot failed — see console";
});
