import type { Scene } from "@babylonjs/core/scene";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { VehicleConfig } from "../physics/RaycastVehicle";
import { DEFAULT_CONFIG } from "../physics/RaycastVehicle";
import { createCar, type CarOptions, type BuiltCar } from "./Car";
import { createLateModel, LATE_MODEL_CONFIG } from "./LateModel";

/** The car classes the player can race. Each has its own body builder, physics baseline,
 *  and an independent career (see Career's class-keyed storage). */
export type CarClassId = "sprint" | "latemodel";

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
    id: "latemodel",
    label: "Dirt Late Model",
    subtitle: "Full-fendered wedge — heavy, planted, big momentum",
    build: createLateModel,
    config: LATE_MODEL_CONFIG,
  },
};

export const CAR_CLASS_LIST: CarClassDef[] = [CAR_CLASSES.sprint, CAR_CLASSES.latemodel];

const CLASS_KEY = "rcsprint.class";

export function isCarClassId(v: string | null): v is CarClassId {
  return v === "sprint" || v === "latemodel";
}

export function loadCarClass(): CarClassId {
  try {
    const v = localStorage.getItem(CLASS_KEY);
    if (isCarClassId(v)) return v;
  } catch { /* ignore */ }
  return "sprint";
}

export function saveCarClass(id: CarClassId) {
  try { localStorage.setItem(CLASS_KEY, id); } catch { /* ignore */ }
}
