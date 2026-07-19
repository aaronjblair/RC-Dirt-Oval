import type { Scene } from "@babylonjs/core/scene";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { VehicleConfig } from "../physics/RaycastVehicle";
import { DEFAULT_CONFIG } from "../physics/RaycastVehicle";
import { createCar, type CarOptions, type BuiltCar } from "./Car";
import { createLateModel, LATE_MODEL_CONFIG } from "./LateModel";
import { createBuggy, BUGGY_CONFIG } from "./Buggy";

/** The car classes the player can race. Each has its own body builder, physics baseline,
 *  and an independent career (see Career's class-keyed storage). */
export type CarClassId = "sprint" | "latemodel" | "buggy";

export type CarBuilder = (
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions,
) => BuiltCar;

export interface CarClassDef {
  id: CarClassId;
  label: string; // menu / garage title
  subtitle: string; // one-line flavour
  build: CarBuilder;
  config: VehicleConfig; // PRISTINE physics baseline (cloned per car by the builder)
}

export const CAR_CLASSES: Record<CarClassId, CarClassDef> = {
  sprint: {
    id: "sprint",
    label: "Winged Sprint Car",
    subtitle: "410 winged dirt sprinter — light, twitchy, downforce on tap",
    build: createCar,
    config: DEFAULT_CONFIG,
  },
  latemodel: {
    id: "latemodel", // id kept as "latemodel" so existing class/career saves survive the rename
    label: "Dirt Sport Mod",
    subtitle: "IMCA-style open-wheel modified — exposed front end, big slab sides",
    build: createLateModel,
    config: LATE_MODEL_CONFIG,
  },
  buggy: {
    id: "buggy",
    label: "1:10 RC Buggy",
    subtitle: "Off-road buggy — knobby tires, long-travel shocks, big rear wing",
    build: createBuggy,
    config: BUGGY_CONFIG,
  },
};

// The Dirt Sport Mod is the game's ONLY class (2026-07-19): the sprint/buggy defs stay in code
// but are no longer offered — the menu list carries just the one entry.
export const CAR_CLASS_LIST: CarClassDef[] = [CAR_CLASSES.latemodel];

const CLASS_KEY = "rcdirtoval.class";

export function isCarClassId(v: string | null): v is CarClassId {
  return v === "sprint" || v === "latemodel" || v === "buggy";
}

export function loadCarClass(): CarClassId {
  // Single-class game (2026-07-19): always the Dirt Sport Mod. Any stored multi-class pick
  // (rcdirtoval.class / old rcsprint.class) is ignored — careers stay keyed per-class, so an
  // old sprint/buggy career simply sits dormant under its own key.
  return "latemodel";
}

export function saveCarClass(id: CarClassId) {
  try { localStorage.setItem(CLASS_KEY, id); } catch { /* ignore */ }
}
