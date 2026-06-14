import type { TrackDef } from "../track/TrackDef";
import type { Standing } from "../career/Career";

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
  preRace(def: TrackDef, round: number, total: number, champ: Standing[], onStart: () => void): HTMLDivElement {
    const p = panel(
      `<div style="font-size:12px;color:#9aa6b3;letter-spacing:1px">ROUND ${round + 1} / ${total} &middot; DIFFICULTY ${def.difficulty}</div>
       <div style="font-size:24px;font-weight:800;color:#ffd34d;margin:2px 0 2px">${def.name}</div>
       <div style="font-size:12px;color:#c8d0da;margin-bottom:12px">${def.laps} laps &middot; ${def.fieldSize} cars &middot; banking ${(def.banking * 57.3).toFixed(0)}&deg;</div>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:8px">CHAMPIONSHIP</div>
       ${standingsTable(champ)}
       <button id="scStart" style="${BTN}">START RACE</button>
       <div style="font-size:11px;color:#7f8a98;text-align:center;margin-top:10px">Press <b>G</b> for garage setup &middot; <b>Arrows/WASD</b> or gamepad to drive</div>`
    );
    (p.querySelector("#scStart") as HTMLButtonElement).onclick = () => { p.remove(); onStart(); };
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
    isFinale: boolean; champion?: string;
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
    const p = panel(
      `<div style="font-size:22px;font-weight:800;color:#ffd34d;margin-bottom:4px">${opts.title}</div>
       ${finale}
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:6px">FINISH &middot; POINTS</div>
       <table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0">${orderRows}</table>
       <div style="font-size:11px;color:#9aa6b3;letter-spacing:1px;margin-top:8px">CHAMPIONSHIP</div>
       ${standingsTable(opts.champ)}
       ${opts.isFinale ? "" : `<button id="scNext" style="${BTN}">NEXT ROUND</button>`}
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
