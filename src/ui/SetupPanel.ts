import type { CarSetup } from "../car/CarSetup";

interface Row { key: keyof CarSetup; label: string; left: string; right: string; }

const ROWS: Row[] = [
  { key: "gearing", label: "Gearing", left: "Accel", right: "Top Speed" },
  { key: "wing", label: "Wing", left: "Low", right: "High" },
  { key: "tire", label: "Tire Compound", left: "Soft", right: "Hard" },
  { key: "camber", label: "Camber", left: "Stable", right: "Sharp" },
  { key: "bias", label: "Weight Bias", left: "Front", right: "Rear" },
];

/**
 * Garage / setup overlay. Sliders for the 5 tunables; live-applies and persists.
 * Toggle with the G key.
 */
export class SetupPanel {
  private root: HTMLDivElement;
  private visible = false;

  constructor(private setup: CarSetup, private onChange: (s: CarSetup) => void, private className = "Losi 22S Sprint") {
    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:360px;" +
      "background:rgba(14,18,24,0.95);border:1px solid #2a3340;border-radius:14px;padding:20px 22px;" +
      "font-family:'Segoe UI',system-ui,sans-serif;color:#eef2f7;display:none;z-index:20;box-shadow:0 12px 40px rgba(0,0,0,0.6);";
    this.build();
    document.body.appendChild(this.root);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyG") this.toggle();
      if (e.code === "Escape" && this.visible) this.toggle();
    });
  }

  private build() {
    const title = document.createElement("div");
    title.innerHTML = `<div style="font-weight:700;font-size:16px;color:#ffd34d">GARAGE — Car Setup</div>
      <div style="font-size:11px;color:#9aa6b3;margin:2px 0 14px">${this.className} &middot; press <b>G</b> to close</div>`;
    this.root.appendChild(title);

    for (const r of ROWS) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "margin:12px 0;";
      const lab = document.createElement("div");
      lab.style.cssText = "display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;";
      lab.innerHTML = `<span style="font-weight:600">${r.label}</span>`;
      const slider = document.createElement("input");
      slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "1";
      slider.value = String(Math.round((this.setup[r.key] as number) * 100));
      slider.style.cssText = "width:100%;accent-color:#ffd34d;";
      slider.oninput = () => {
        (this.setup[r.key] as number) = parseInt(slider.value, 10) / 100;
        this.onChange({ ...this.setup });
      };
      const ends = document.createElement("div");
      ends.style.cssText = "display:flex;justify-content:space-between;font-size:10px;color:#7f8a98;";
      ends.innerHTML = `<span>${r.left}</span><span>${r.right}</span>`;
      wrap.appendChild(lab); wrap.appendChild(slider); wrap.appendChild(ends);
      this.root.appendChild(wrap);
    }
  }

  toggle() {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "block" : "none";
  }
}
