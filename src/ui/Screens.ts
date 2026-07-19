import type { TrackDef } from "../track/TrackDef";
import type { Standing } from "../career/Career";
import { openGuide } from "./Guide";

const CARD =
  "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);min-width:380px;max-width:460px;" +
  "max-height:92vh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;" +
  "background:rgba(12,16,22,0.96);border:1px solid #2a3340;border-radius:16px;padding:18px 24px;" +
  "font-family:'Segoe UI',system-ui,sans-serif;color:#eef2f7;z-index:30;box-shadow:0 16px 50px rgba(0,0,0,0.65);";
const BTN =
  "display:block;width:100%;margin-top:10px;padding:12px;border:none;border-radius:10px;cursor:pointer;" +
  "font-size:15px;font-weight:700;background:#ffd34d;color:#1a1205;";
const BTN2 = BTN.replace("#ffd34d", "#33414f").replace("color:#1a1205", "color:#eef2f7");

function standingsTable(rows: Standing[], limit = 8): string {
  if (!rows.length) return `<div style="color:#9aa6b3;font-size:12px;margin:8px 0">No championship points yet.</div>`;
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 4px">` +
    rows.slice(0, limit).map((r, i) =>
      `<tr style="border-bottom:1px solid #1e2630">
        <td style="padding:3px 0;color:#9aa6b3;width:26px">${i + 1}</td>
        <td style="padding:3px 0">${r.name}</td>
        <td style="padding:3px 0;text-align:right;font-weight:700">${r.points}</td></tr>`
    ).join("") + `</table>`
  );
}

function panel(html: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = CARD;
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}

export const Screens = {
  /** Full-screen winner's photo (Jay by the #32) — shown whenever the PLAYER wins; waits for CONTINUE. */
  victory(onContinue: () => void): HTMLDivElement {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;inset:0;z-index:40;background:rgba(4,6,9,0.92);display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:14px;padding:3vh 0";
    d.innerHTML =
      `<div style="font-family:'Segoe UI',system-ui,sans-serif;font-size:26px;font-weight:800;color:#ffd34d;letter-spacing:2px">&#127942; WINNER!</div>
       <img src="${import.meta.env.BASE_URL}superjay-victory.png" alt="Winner"
         style="max-height:74vh;max-width:92vw;border-radius:12px;box-shadow:0 16px 60px rgba(0,0,0,0.8)" />
       <button id="vicGo" style="${BTN};width:auto;padding:12px 42px;margin-top:0">CONTINUE</button>`;
    (d.querySelector("#vicGo") as HTMLButtonElement).onclick = () => { d.remove(); onContinue(); };
    document.body.appendChild(d);
    return d;
  },

  /** Full-screen attract title over the cinematic reel. Any click/key enters the menu. */
  attract(def: TrackDef, onEnter: () => void): HTMLDivElement {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;inset:0;z-index:25;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;" +
      "padding-bottom:9vh;cursor:pointer;font-family:'Segoe UI',system-ui,sans-serif;text-align:center;" +
      "background:linear-gradient(to bottom,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 64%,rgba(0,0,0,0.60) 100%);";
    d.innerHTML =
      `<div style="font-size:64px;font-weight:900;letter-spacing:4px;color:#ffd34d;text-shadow:0 4px 26px rgba(0,0,0,0.95)">SUPER JAY RC</div>
       <div style="font-size:15px;letter-spacing:2px;color:#dfe7f0;text-shadow:0 2px 10px rgba(0,0,0,0.9);margin-top:2px">1/10 DIRT-OVAL SPRINT CAR RACING</div>
       <div style="font-size:12px;color:#c8d0da;text-shadow:0 2px 8px rgba(0,0,0,0.9);margin-top:6px">Featuring &middot; ${def.name}</div>
       <div style="margin-top:22px;font-size:15px;font-weight:800;color:#0c0f14;background:#ffd34d;padding:12px 28px;border-radius:30px;box-shadow:0 6px 20px rgba(0,0,0,0.5);animation:atPulse 1.4s ease-in-out infinite">CLICK OR PRESS ANY KEY TO RACE</div>
       <button id="atGuide" style="margin-top:14px;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.28);color:#eef2f7;font-size:13px;font-weight:600;letter-spacing:0.5px;padding:8px 18px;border-radius:24px;cursor:pointer">&#128214; Driver's Manual</button>`;
    const st = document.createElement("style");
    st.textContent = "@keyframes atPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}";
    d.appendChild(st);
    document.body.appendChild(d);
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener("keydown", go); d.remove(); onEnter(); };
    d.addEventListener("click", go);
    window.addEventListener("keydown", go);
    // Manual opens without starting the race (stop the click from bubbling to `go`).
    (d.querySelector("#atGuide") as HTMLButtonElement).addEventListener("click", (e) => { e.stopPropagation(); openGuide(); });
    return d;
  },

  /** Choose the car class to race (shown when the app opens). Picking the current class continues;
   *  picking another reloads into it (the caller persists + reloads). */
  classSelect(
    current: string,
    classes: { id: string; label: string; subtitle: string }[],
    onPick: (id: string) => void,
  ): HTMLDivElement {
    const cards = classes.map((c) => {
      const sel = c.id === current;
      return `<button id="cls_${c.id}" style="${BTN2};text-align:left;margin-top:12px;padding:14px 16px;${sel ? "border:2px solid #ffd34d;background:#3a4250" : "border:2px solid transparent"}">
          <div style="font-size:16px;font-weight:800;color:#ffd34d">${c.label}${sel ? " &nbsp;<span style='font-size:11px;color:#9aa6b3'>(current)</span>" : ""}</div>
          <div style="font-size:12px;color:#c8d0da;margin-top:3px">${c.subtitle}</div>
        </button>`;
    }).join("");
    const p = panel(
      `<div style="font-size:12px;color:#9aa6b3;letter-spacing:1px">CHOOSE YOUR CLASS</div>
       <div style="font-size:22px;font-weight:800;color:#ffd34d;margin:2px 0 4px">Pick a car</div>
       <div style="font-size:12px;color:#c8d0da;margin-bottom:6px">Each class runs its own championship. Switch any time from here.</div>
       ${cards}`
    );
    for (const c of classes) {
      (p.querySelector(`#cls_${c.id}`) as HTMLButtonElement).onclick = () => { p.remove(); onPick(c.id); };
    }
    return p;
  },

  /** Pick the game mode (shown before the class/career flow). Highlights `current`; clicking a
   *  button removes the overlay and calls `onPick(mode)`. */
  modeSelect(current: "career" | "arcade", onPick: (mode: "career" | "arcade") => void): void {
    const modes: { id: "career" | "arcade"; label: string; subtitle: string }[] = [
      { id: "career", label: "CAREER / SIM", subtitle: "Realistic 15-track championship. Evolving grip, garage setup, always advance." },
      { id: "arcade", label: "ARCADE (RC Pro-Am)", subtitle: "Grab pickups &amp; boost strips, collect the letters, dodge the slicks. Finish top-3 or burn a continue." },
    ];
    const cards = modes.map((m) => {
      const sel = m.id === current;
      return `<button id="mode_${m.id}" style="${BTN2};text-align:left;margin-top:12px;padding:14px 16px;${sel ? "border:2px solid #ffd34d;background:#3a4250" : "border:2px solid transparent"}">
          <div style="font-size:16px;font-weight:800;color:#ffd34d">${m.label}${sel ? " &nbsp;<span style='font-size:11px;color:#9aa6b3'>(current)</span>" : ""}</div>
          <div style="font-size:12px;color:#c8d0da;margin-top:3px">${m.subtitle}</div>
        </button>`;
    }).join("");
    const p = panel(
      `<div style="font-size:12px;color:#9aa6b3;letter-spacing:1px">CHOOSE MODE</div>
       <div style="font-size:22px;font-weight:800;color:#ffd34d;margin:2px 0 4px">How do you want to race?</div>
       <div style="font-size:12px;color:#c8d0da;margin-bottom:6px">Pick a mode &mdash; you can come back here any time.</div>
       ${cards}`
    );
    for (const m of modes) {
      (p.querySelector(`#mode_${m.id}`) as HTMLButtonElement).onclick = () => { p.remove(); onPick(m.id); };
    }
  },

  preRace(def: TrackDef, round: number, total: number, champ: Standing[], onStart: () => void): HTMLDivElement {
    const p = panel(
      `<div style="font-size:12px;color:#9aa6b3;letter-spacing:1px">ROUND ${round + 1} / ${total} &middot; DIFFICULTY ${def.difficulty}</div>
       <div style="font-size:24px;font-weight:800;color:#ffd34d;margin:2px 0 2px">${def.name}</div>
       <div style="font-size:12px;color:#c8d0da;margin-bottom:12px">${def.laps} laps &middot; ${def.fieldSize} cars &middot; banking ${(def.banking * 57.3).toFixed(0)}&deg;</div>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:8px">CHAMPIONSHIP</div>
       ${standingsTable(champ)}
       <button id="scStart" style="${BTN}">START RACE</button>
       <button id="scGuide" style="${BTN2}">&#128214; DRIVER'S MANUAL</button>
       <div style="font-size:11px;color:#7f8a98;text-align:center;margin-top:10px">Press <b>G</b> for garage setup &middot; <b>Arrows/WASD</b> or gamepad to drive</div>`
    );
    (p.querySelector("#scStart") as HTMLButtonElement).onclick = () => { p.remove(); onStart(); };
    (p.querySelector("#scGuide") as HTMLButtonElement).onclick = () => openGuide();
    return p;
  },

  /** Optional driver-name entry shown after START. The box is pre-filled with `defaultName`
   *  ("Super Jay" by default); keep it or type your own. Blank → default. `onSubmit` gets the raw
   *  text (the caller title-cases it). */
  namePrompt(defaultName: string, onSubmit: (raw: string) => void): HTMLDivElement {
    const p = panel(
      `<div style="font-size:22px;font-weight:800;color:#ffd34d;margin-bottom:4px">Driver name</div>
       <div style="font-size:12px;color:#c8d0da;margin-bottom:14px">Enter your name for the leaderboard, or leave it as is.</div>
       <input id="scName" type="text" maxlength="22" autocomplete="off"
         style="display:block;width:100%;box-sizing:border-box;padding:12px;border:1px solid #2a3340;border-radius:10px;
         background:#0c0f14;color:#eef2f7;font-size:16px;font-family:inherit;outline:none" />
       <button id="scNameGo" style="${BTN}">GO</button>`
    );
    const input = p.querySelector("#scName") as HTMLInputElement;
    input.value = defaultName;
    let done = false;
    const submit = () => { if (done) return; done = true; const raw = input.value; p.remove(); onSubmit(raw); };
    (p.querySelector("#scNameGo") as HTMLButtonElement).onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    // Focus + select so the user can immediately type over the default.
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return p;
  },

  /** ONE unified pre-race setup screen: driver name + car class + game mode + sound, then START.
   *  `onStart` gets the chosen settings; the caller persists them (reloading if class/mode changed). */
  setup(opts: {
    def: TrackDef; round: number; total: number; champ: Standing[];
    name: string;
    classes: { id: string; label: string; subtitle: string }[];
    currentClass: string; currentMode: "career" | "arcade"; currentTrack: "career" | "figure8" | "offroad";
    currentTime: "day" | "night";
    muted: boolean; autoThrottle: boolean;
    onStart: (sel: { name: string; classId: string; mode: "career" | "arcade"; track: "career" | "figure8" | "offroad"; time: "day" | "night"; muted: boolean; auto: boolean }) => void;
    onExportSave: () => void;
    onImportSave: (text: string) => string | null; // returns an error message, or null on success
  }): HTMLDivElement {
    let selClass = opts.currentClass;
    let selMode: "career" | "arcade" = opts.currentMode;
    let selTrack: "career" | "figure8" | "offroad" = opts.currentTrack;
    let selTime: "day" | "night" = opts.currentTime;
    let selMuted = opts.muted;
    let selAuto = opts.autoThrottle;
    const pick = "text-align:left;margin-top:8px;padding:10px 12px";
    const classBtns = opts.classes.map((c) =>
      `<button class="suClass" data-id="${c.id}" style="${BTN2};${pick}">
         <div style="font-size:14px;font-weight:800;color:#ffd34d">${c.label}</div>
         <div style="font-size:11px;color:#c8d0da;margin-top:2px">${c.subtitle}</div></button>`).join("");
    const modes: { id: "career" | "arcade"; label: string; sub: string }[] = [
      { id: "career", label: "CAREER / SIM", sub: "15-track championship, evolving grip, always advance." },
      { id: "arcade", label: "ARCADE (RC Pro-Am)", sub: "Overhead view, dodge the slicks, top-3 or burn a continue." },
    ];
    const modeBtns = modes.map((m) =>
      `<button class="suMode" data-id="${m.id}" style="${BTN2};${pick}">
         <div style="font-size:14px;font-weight:800;color:#ffd34d">${m.label}</div>
         <div style="font-size:11px;color:#c8d0da;margin-top:2px">${m.sub}</div></button>`).join("");
    const tracks: { id: "career" | "figure8" | "offroad"; label: string; sub: string }[] = [
      { id: "career", label: "CAREER OVAL", sub: "The 15-round championship on the banked dirt oval." },
      { id: "figure8", label: "FIGURE-8", sub: "Self-crossing at-grade X &mdash; cross traffic, T-bones, chaos." },
      { id: "offroad", label: "OFF-ROAD STADIUM", sub: "Buggy-only. Floodlit supercross arena — bermed loop, varied jumps." },
    ];
    const trackBtns = tracks.map((t) =>
      `<button class="suTrack" data-id="${t.id}" style="${BTN2};${pick}">
         <div style="font-size:14px;font-weight:800;color:#ffd34d">${t.label}</div>
         <div style="font-size:11px;color:#c8d0da;margin-top:2px">${t.sub}</div></button>`).join("");
    const p = panel(
      `<div style="font-size:12px;color:#9aa6b3;letter-spacing:1px">RACE SETUP &middot; ROUND ${opts.round + 1}/${opts.total}</div>
       <div style="font-size:22px;font-weight:800;color:#ffd34d;margin:2px 0 8px">${opts.def.name}</div>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px">DRIVER NAME</div>
       <input id="suName" type="text" maxlength="22" autocomplete="off"
         style="display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:4px;border:1px solid #2a3340;border-radius:9px;background:#0c0f14;color:#eef2f7;font-size:15px;font-family:inherit;outline:none" />
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:12px">CLASS</div>${classBtns}
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:12px">MODE</div>${modeBtns}
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:12px">TRACK</div>${trackBtns}
       <button id="suTime" style="${BTN2};margin-top:12px"></button>
       <button id="suSound" style="${BTN2};margin-top:8px"></button>
       <button id="suAuto" style="${BTN2};margin-top:8px"></button>
       <button id="suStart" style="${BTN};margin-top:14px">START RACE</button>
       <button id="suGuide" style="${BTN2}">&#128214; DRIVER'S MANUAL</button>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:12px">SAVE DATA &mdash; career progress auto-saves; back it up or move it between devices</div>
       <div style="display:flex;gap:8px">
         <button id="suExport" style="${BTN2};flex:1">&#11015;&#65039; EXPORT SAVE</button>
         <button id="suImport" style="${BTN2};flex:1">&#11014;&#65039; IMPORT SAVE</button>
       </div>
       <div id="suSaveMsg" style="font-size:11px;color:#9aa6b3;text-align:center;margin-top:4px;min-height:14px"></div>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:12px">CHAMPIONSHIP</div>${standingsTable(opts.champ, 5)}`
    );
    const input = p.querySelector("#suName") as HTMLInputElement;
    input.value = opts.name;
    const paint = () => {
      p.querySelectorAll(".suClass").forEach((b) => {
        const el = b as HTMLElement, on = el.dataset.id === selClass;
        el.style.border = on ? "2px solid #ffd34d" : "2px solid transparent";
        el.style.background = on ? "#3a4250" : "#33414f";
      });
      p.querySelectorAll(".suMode").forEach((b) => {
        const el = b as HTMLElement, on = el.dataset.id === selMode;
        el.style.border = on ? "2px solid #ffd34d" : "2px solid transparent";
        el.style.background = on ? "#3a4250" : "#33414f";
      });
      p.querySelectorAll(".suTrack").forEach((b) => {
        const el = b as HTMLElement, on = el.dataset.id === selTrack;
        el.style.border = on ? "2px solid #ffd34d" : "2px solid transparent";
        el.style.background = on ? "#3a4250" : "#33414f";
      });
      (p.querySelector("#suTime") as HTMLButtonElement).innerHTML = selTrack === "career"
        ? "&#127765; TIME: RANDOM (varies each round)"
        : (selTime === "night" ? "&#127769; TIME: NIGHT" : "&#9728;&#65039; TIME: DAY");
      (p.querySelector("#suSound") as HTMLButtonElement).innerHTML = selMuted ? "&#128263; SOUND: OFF" : "&#128266; SOUND: ON";
      (p.querySelector("#suAuto") as HTMLButtonElement).innerHTML = selAuto ? "&#127937; AUTO-THROTTLE: ON (steer only)" : "&#127937; AUTO-THROTTLE: OFF";
    };
    p.querySelectorAll(".suClass").forEach((b) => ((b as HTMLElement).onclick = () => {
      selClass = (b as HTMLElement).dataset.id!;
      // Off-road is buggy-only: choosing a non-buggy class drops off-road back to the career oval.
      if (selClass !== "buggy" && selTrack === "offroad") selTrack = "career";
      paint();
    }));
    p.querySelectorAll(".suMode").forEach((b) => ((b as HTMLElement).onclick = () => { selMode = (b as HTMLElement).dataset.id as "career" | "arcade"; paint(); }));
    p.querySelectorAll(".suTrack").forEach((b) => ((b as HTMLElement).onclick = () => {
      selTrack = (b as HTMLElement).dataset.id as "career" | "figure8" | "offroad";
      // Off-road is buggy-only: picking it switches the class to the buggy.
      if (selTrack === "offroad") selClass = "buggy";
      paint();
    }));
    // In career the time button is informational ("RANDOM per round") — don't let a click flip the
    // hidden selTime (which would force a needless reload + write the exhibition pref on START).
    (p.querySelector("#suTime") as HTMLButtonElement).onclick = () => { if (selTrack !== "career") { selTime = selTime === "night" ? "day" : "night"; paint(); } };
    (p.querySelector("#suSound") as HTMLButtonElement).onclick = () => { selMuted = !selMuted; paint(); };
    (p.querySelector("#suAuto") as HTMLButtonElement).onclick = () => { selAuto = !selAuto; paint(); };
    (p.querySelector("#suGuide") as HTMLButtonElement).onclick = () => openGuide();
    // Save data: export downloads a JSON backup; import reads one back (validated — a bad
    // file is rejected without touching the existing save) then reloads into the new state.
    const saveMsg = p.querySelector("#suSaveMsg") as HTMLDivElement;
    (p.querySelector("#suExport") as HTMLButtonElement).onclick = () => {
      opts.onExportSave();
      saveMsg.style.color = "#6dff7a";
      saveMsg.textContent = "Save exported — check your downloads.";
    };
    (p.querySelector("#suImport") as HTMLButtonElement).onclick = () => {
      const file = document.createElement("input");
      file.type = "file";
      file.accept = ".json,application/json";
      file.onchange = () => {
        const f = file.files?.[0];
        if (!f) return;
        f.text().then((text) => {
          const err = opts.onImportSave(text);
          if (err) { saveMsg.style.color = "#ff7a6d"; saveMsg.textContent = err; return; }
          saveMsg.style.color = "#6dff7a";
          saveMsg.textContent = "Save imported — reloading…";
          setTimeout(() => location.reload(), 600);
        });
      };
      file.click();
    };
    (p.querySelector("#suStart") as HTMLButtonElement).onclick = () => { p.remove(); opts.onStart({ name: input.value, classId: selClass, mode: selMode, track: selTrack, time: selTime, muted: selMuted, auto: selAuto }); };
    paint();
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return p;
  },

  /** In-race pause menu: Resume / Restart / Quit to Menu, plus a live SETTINGS panel (sound,
   *  auto-throttle, graphics quality, camera view — all applied instantly). The race stays frozen
   *  behind it, so Resume returns to the exact race state; only Quit leaves to the home screen. */
  pauseMenu(opts: {
    onResume: () => void; onRestart: () => void; onMenu: () => void;
    muted: boolean; onToggleSound: () => boolean;
    autoThrottle: boolean; onToggleAuto: () => boolean;
    qualityLabel: string; onCycleQuality: () => string;
    viewLabel: string; onCycleView: () => string;
  }): HTMLDivElement {
    const p = panel(
      `<div style="font-size:24px;font-weight:900;letter-spacing:2px;color:#ffd34d;text-align:center;margin-bottom:4px">&#9208; PAUSED</div>
       <div style="font-size:12px;color:#c8d0da;text-align:center;margin-bottom:12px">The race is frozen &mdash; change settings, pick up right where you left off, restart, or quit to the menu.</div>
       <button id="puResume" style="${BTN}">RESUME</button>
       <button id="puRestart" style="${BTN2}">RESTART RACE</button>
       <div style="font-size:11px;color:#7f8a98;letter-spacing:1px;text-align:center;margin:10px 0 4px">SETTINGS &mdash; applied instantly</div>
       <button id="puSound" style="${BTN2}"></button>
       <button id="puAuto" style="${BTN2}"></button>
       <button id="puQuality" style="${BTN2}"></button>
       <button id="puView" style="${BTN2}"></button>
       <button id="puMenu" style="${BTN2}">QUIT TO MENU</button>
       <div style="font-size:11px;color:#7f8a98;text-align:center;margin-top:10px">Press <b>P</b> to resume</div>`
    );
    const sndBtn = p.querySelector("#puSound") as HTMLButtonElement;
    const paintSnd = (muted: boolean) => { sndBtn.innerHTML = muted ? "&#128263; SOUND: OFF" : "&#128266; SOUND: ON"; };
    paintSnd(opts.muted);
    sndBtn.onclick = () => paintSnd(opts.onToggleSound());
    const autoBtn = p.querySelector("#puAuto") as HTMLButtonElement;
    const paintAuto = (on: boolean) => { autoBtn.innerHTML = on ? "&#128663; AUTO-THROTTLE: ON" : "&#128663; AUTO-THROTTLE: OFF"; };
    paintAuto(opts.autoThrottle);
    autoBtn.onclick = () => paintAuto(opts.onToggleAuto());
    const qBtn = p.querySelector("#puQuality") as HTMLButtonElement;
    const paintQ = (label: string) => { qBtn.innerHTML = "&#9881;&#65039; GRAPHICS: " + label; };
    paintQ(opts.qualityLabel);
    qBtn.onclick = () => paintQ(opts.onCycleQuality());
    const vBtn = p.querySelector("#puView") as HTMLButtonElement;
    const paintV = (label: string) => { vBtn.innerHTML = "&#127909; CAMERA: " + label; };
    paintV(opts.viewLabel);
    vBtn.onclick = () => paintV(opts.onCycleView());
    (p.querySelector("#puResume") as HTMLButtonElement).onclick = () => opts.onResume();
    (p.querySelector("#puRestart") as HTMLButtonElement).onclick = () => opts.onRestart();
    (p.querySelector("#puMenu") as HTMLButtonElement).onclick = () => opts.onMenu();
    return p;
  },

  countdown(onGo: () => void) {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:30;pointer-events:none;" +
      "font-family:'Segoe UI',system-ui,sans-serif;font-size:120px;font-weight:900;color:#ffd34d;text-shadow:0 4px 20px rgba(0,0,0,0.8);";
    document.body.appendChild(d);
    const seq = ["3", "2", "1", "GO!"];
    let i = 0;
    const tick = () => {
      d.textContent = seq[i];
      d.style.color = i === 3 ? "#6dff7a" : "#ffd34d";
      if (i === 3) { onGo(); setTimeout(() => d.remove(), 700); }
      i++;
      if (i <= 3) setTimeout(tick, 800);
    };
    tick();
  },

  /** Drag-strip "Christmas tree" start. Replaces the plain 3-2-1 countdown but keeps the same
   *  contract: `onGo()` fires exactly once at GREEN, at the same canonical timing the old
   *  `countdown` used (≈2.4s in). Pure-CSS bulbs, `pointer-events:none`, auto-dismisses. */
  arcadeLightTree(onGo: () => void) {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;" +
      "pointer-events:none;font-family:'Segoe UI',system-ui,sans-serif;" +
      // Smaller (≈1/3) and nudged DOWN from center so it doesn't fill the screen.
      "transform:translateY(22vh) scale(0.34);transform-origin:center;";
    // A bulb: dim by default; the .lit-* classes brighten it + add a glow.
    const dim = (color: string) =>
      `radial-gradient(circle at 38% 34%, ${color}33 0%, ${color}1a 55%, #05080b 100%)`;
    const lit = (color: string) =>
      `radial-gradient(circle at 38% 34%, #ffffff 0%, ${color} 42%, ${color} 70%, ${color}88 100%)`;
    const AMBER = "#ff9d1f";
    const GREEN = "#37e84f";
    const bulb = (id: string, color: string) =>
      `<div id="${id}" style="width:78px;height:78px;border-radius:50%;margin:8px 0;border:2px solid #1c2630;background:${dim(color)};transition:background 90ms,box-shadow 90ms"></div>`;
    d.innerHTML =
      `<div style="background:#0a0d12;border:2px solid #1c2630;border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;align-items:center;box-shadow:0 16px 50px rgba(0,0,0,0.7)">
         <div style="display:flex;gap:14px;margin-bottom:4px">
           ${bulb("ltStage1", "#3a82ff")}${bulb("ltStage2", "#3a82ff")}
         </div>
         ${bulb("ltA1", AMBER)}
         ${bulb("ltA2", AMBER)}
         ${bulb("ltA3", AMBER)}
         ${bulb("ltG", GREEN)}
       </div>
       <div id="ltLabel" style="margin-top:18px;font-size:42px;font-weight:900;letter-spacing:3px;color:#ffd34d;text-shadow:0 4px 20px rgba(0,0,0,0.85)">GET READY</div>`;
    document.body.appendChild(d);
    const light = (id: string, color: string) => {
      const el = d.querySelector("#" + id) as HTMLDivElement | null;
      if (el) { el.style.background = lit(color); el.style.boxShadow = `0 0 26px ${color}, 0 0 10px ${color} inset`; }
    };
    // Pre-stage dots come on immediately.
    light("ltStage1", "#3a82ff");
    light("ltStage2", "#3a82ff");
    let fired = false;
    const STEP = 600;
    setTimeout(() => light("ltA1", AMBER), STEP);       // amber 1 @ 600ms
    setTimeout(() => light("ltA2", AMBER), STEP * 2);   // amber 2 @ 1200ms
    setTimeout(() => light("ltA3", AMBER), STEP * 3);   // amber 3 @ 1800ms
    setTimeout(() => {                                   // GREEN @ 2400ms (same as old "GO!")
      light("ltG", GREEN);
      const label = d.querySelector("#ltLabel") as HTMLDivElement | null;
      if (label) { label.textContent = "GO!"; label.style.color = "#6dff7a"; label.style.fontSize = "64px"; }
      if (!fired) { fired = true; onGo(); }
      setTimeout(() => d.remove(), 700);
    }, STEP * 4);
  },

  /** Post-race REPLAY control bar (bottom of screen): play/pause, a scrub slider, a speed cycle,
   *  a camera cycle, and Done. Returns handles so the caller updates the playhead each frame. */
  replayControls(opts: {
    duration: number;
    onPlayPause: () => boolean; // returns the new playing state
    onSeek: (frac: number) => void;
    onSpeed: () => number;      // returns the new speed multiplier
    onCamera: () => string;     // returns the new camera label
    onDone: () => void;
  }): { setPlayhead: (frac: number, playing: boolean) => void; remove: () => void } {
    const bar = document.createElement("div");
    bar.style.cssText =
      "position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:32;" +
      "display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;" +
      "background:rgba(12,16,22,0.92);border:1px solid #2a3340;box-shadow:0 10px 36px rgba(0,0,0,0.6);" +
      "font-family:'Segoe UI',system-ui,sans-serif;color:#eef2f7;max-width:min(94vw,720px);";
    const mkb = (bg = "#33414f", col = "#eef2f7") =>
      `padding:9px 12px;border:none;border-radius:9px;cursor:pointer;font-size:14px;font-weight:700;background:${bg};color:${col};white-space:nowrap`;
    bar.innerHTML =
      `<div style="font-size:11px;letter-spacing:1px;color:#ffd34d;font-weight:800">REPLAY</div>
       <button id="rpPlay" style="${mkb("#ffd34d", "#1a1205")}">&#10073;&#10073;</button>
       <input id="rpSeek" type="range" min="0" max="1000" value="0" style="flex:1;min-width:140px;accent-color:#ffd34d" />
       <span id="rpTime" style="font-variant-numeric:tabular-nums;font-size:12px;color:#c8d0da;min-width:70px;text-align:center"></span>
       <button id="rpSpeed" style="${mkb()}">1×</button>
       <button id="rpCam" style="${mkb()}">&#127916; CINE</button>
       <button id="rpDone" style="${mkb("#2a3340")}">DONE</button>`;
    document.body.appendChild(bar);
    const seek = bar.querySelector("#rpSeek") as HTMLInputElement;
    const playBtn = bar.querySelector("#rpPlay") as HTMLButtonElement;
    const speedBtn = bar.querySelector("#rpSpeed") as HTMLButtonElement;
    const camBtn = bar.querySelector("#rpCam") as HTMLButtonElement;
    const timeEl = bar.querySelector("#rpTime") as HTMLSpanElement;
    const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    let scrubbing = false;
    seek.addEventListener("pointerdown", () => { scrubbing = true; });
    seek.addEventListener("pointerup", () => { scrubbing = false; });
    seek.addEventListener("input", () => { opts.onSeek(Number(seek.value) / 1000); });
    playBtn.onclick = () => { const playing = opts.onPlayPause(); playBtn.innerHTML = playing ? "&#10073;&#10073;" : "&#9654;"; };
    speedBtn.onclick = () => { speedBtn.textContent = `${opts.onSpeed()}×`; };
    camBtn.onclick = () => { camBtn.innerHTML = `&#127916; ${opts.onCamera().toUpperCase()}`; };
    (bar.querySelector("#rpDone") as HTMLButtonElement).onclick = () => { bar.remove(); opts.onDone(); };
    return {
      setPlayhead: (frac: number, playing: boolean) => {
        if (!scrubbing) seek.value = String(Math.round(frac * 1000));
        timeEl.textContent = `${fmtT(frac * opts.duration)} / ${fmtT(opts.duration)}`;
        playBtn.innerHTML = playing ? "&#10073;&#10073;" : "&#9654;";
      },
      remove: () => bar.remove(),
    };
  },

  results(opts: {
    title: string; order: { name: string; gained: number }[]; champ: Standing[];
    isFinale: boolean; canAdvance: boolean; finishPos: number; champion?: string;
    onNext: () => void; onReplay: () => void; onReset: () => void; onWatchReplay?: () => void;
    muted?: boolean; onToggleSound?: () => boolean;
  }): HTMLDivElement {
    const orderRows = opts.order.map((r, i) =>
      `<tr style="border-bottom:1px solid #1e2630">
        <td style="padding:3px 0;color:#9aa6b3;width:26px">${i + 1}</td>
        <td style="padding:3px 0">${r.name}</td>
        <td style="padding:3px 0;text-align:right;color:#6dff7a">+${r.gained}</td></tr>`).join("");
    const finale = opts.isFinale
      ? `<div style="margin:10px 0;padding:10px;background:#1c2733;border-radius:8px;text-align:center">
           <div style="font-size:12px;color:#9aa6b3">SEASON CHAMPION</div>
           <div style="font-size:20px;font-weight:800;color:#ffd34d">${opts.champion}</div></div>` : "";
    // Podium-or-better unlocks the next round; otherwise the driver must replay.
    const lockNote = (!opts.isFinale && !opts.canAdvance)
      ? `<div style="margin:8px 0;padding:9px 11px;background:#2a1c1c;border:1px solid #5a2b2b;border-radius:8px;font-size:12px;color:#f1c0c0">
           Finished <b>P${opts.finishPos}</b> — you need a <b>top-3 podium</b> to advance. Replay the round to qualify for the next track.</div>`
      : "";
    const p = panel(
      `<div style="font-size:22px;font-weight:800;color:#ffd34d;margin-bottom:4px">${opts.title}</div>
       ${finale}
       ${lockNote}
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:6px">FINISH &middot; POINTS</div>
       <table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0">${orderRows}</table>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:8px">CHAMPIONSHIP</div>
       ${standingsTable(opts.champ)}
       ${(opts.isFinale || !opts.canAdvance) ? "" : `<button id="scNext" style="${BTN}">NEXT ROUND</button>`}
       ${opts.onWatchReplay ? `<button id="scWatch" style="${BTN2}">&#9654; WATCH REPLAY</button>` : ""}
       <button id="scReplay" style="${BTN2}">RACE AGAIN</button>
       ${opts.onToggleSound ? `<button id="scSound" style="${BTN2}"></button>` : ""}
       <button id="scReset" style="${BTN2}">RESET CAREER</button>`
    );
    const next = p.querySelector("#scNext") as HTMLButtonElement | null;
    if (next) next.onclick = () => { p.remove(); opts.onNext(); };
    const watch = p.querySelector("#scWatch") as HTMLButtonElement | null;
    if (watch && opts.onWatchReplay) watch.onclick = () => { p.remove(); opts.onWatchReplay!(); };
    const snd = p.querySelector("#scSound") as HTMLButtonElement | null;
    if (snd && opts.onToggleSound) {
      const paintSnd = (muted: boolean) => { snd.innerHTML = muted ? "&#128263; SOUND: OFF" : "&#128266; SOUND: ON"; };
      paintSnd(!!opts.muted);
      snd.onclick = () => paintSnd(opts.onToggleSound!());
    }
    (p.querySelector("#scReplay") as HTMLButtonElement).onclick = () => { p.remove(); opts.onReplay(); };
    (p.querySelector("#scReset") as HTMLButtonElement).onclick = () => { p.remove(); opts.onReset(); };
    return p;
  },
};
