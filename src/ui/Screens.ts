import type { TrackDef } from "../track/TrackDef";
import type { Standing } from "../career/Career";
import { openGuide } from "./Guide";

const CARD =
  "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);min-width:380px;max-width:460px;" +
  "background:rgba(12,16,22,0.96);border:1px solid #2a3340;border-radius:16px;padding:24px 28px;" +
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
  /** Full-screen attract title over the cinematic reel. Any click/key enters the menu. */
  attract(def: TrackDef, onEnter: () => void): HTMLDivElement {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;inset:0;z-index:25;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;" +
      "padding-bottom:9vh;cursor:pointer;font-family:'Segoe UI',system-ui,sans-serif;text-align:center;" +
      "background:linear-gradient(to bottom,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 64%,rgba(0,0,0,0.60) 100%);";
    d.innerHTML =
      `<div style="font-size:64px;font-weight:900;letter-spacing:4px;color:#ffd34d;text-shadow:0 4px 26px rgba(0,0,0,0.95)">RCSPRINT</div>
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

  results(opts: {
    title: string; order: { name: string; gained: number }[]; champ: Standing[];
    isFinale: boolean; canAdvance: boolean; finishPos: number; champion?: string;
    onNext: () => void; onReplay: () => void; onReset: () => void;
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
       <button id="scReplay" style="${BTN2}">REPLAY ROUND</button>
       <button id="scReset" style="${BTN2}">RESET CAREER</button>`
    );
    const next = p.querySelector("#scNext") as HTMLButtonElement | null;
    if (next) next.onclick = () => { p.remove(); opts.onNext(); };
    (p.querySelector("#scReplay") as HTMLButtonElement).onclick = () => { p.remove(); opts.onReplay(); };
    (p.querySelector("#scReset") as HTMLButtonElement).onclick = () => { p.remove(); opts.onReset(); };
    return p;
  },
};
