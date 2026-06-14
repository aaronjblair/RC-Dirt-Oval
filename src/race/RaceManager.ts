import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { OvalTrack } from "../track/OvalTrack";

export interface Racer {
  id: string;
  name: string;
  isPlayer: boolean;
  getPos: () => Vector3;
  lap: number;
  prevS: number;
  passedHalf: boolean;
  lapStart: number;
  bestLap: number;
  lastLap: number;
  finished: boolean;
  // for live position ordering
  progress: number; // lap*length + s
}

export interface RaceState {
  started: boolean;
  finished: boolean;
  totalLaps: number;
}

/**
 * Lap timing + live positions across the field. Detects a clean forward
 * crossing of the start/finish line (must have passed the back half first),
 * tracks per-racer lap/best/last times and computes running order.
 */
export class RaceManager {
  racers: Racer[] = [];
  state: RaceState;

  constructor(private track: OvalTrack, totalLaps: number) {
    this.state = { started: false, finished: false, totalLaps };
  }

  add(id: string, name: string, isPlayer: boolean, getPos: () => Vector3): Racer {
    const r: Racer = {
      id, name, isPlayer, getPos,
      lap: 0, prevS: 0, passedHalf: false,
      lapStart: 0, bestLap: 0, lastLap: 0, finished: false, progress: 0,
    };
    this.racers.push(r);
    return r;
  }

  start(now: number) {
    this.state.started = true;
    for (const r of this.racers) {
      r.lap = 0;
      r.lapStart = now;
      r.prevS = this.track.project(r.getPos()).s;
      r.passedHalf = false;
    }
  }

  update(now: number) {
    if (!this.state.started) return;
    const len = this.track.length;
    for (const r of this.racers) {
      const proj = this.track.project(r.getPos());
      const s = proj.s;
      // mark having reached the back half (prevents line-jitter false laps)
      if (s > len * 0.4 && s < len * 0.6) r.passedHalf = true;

      // forward crossing of s=0 (prevS near end, s near start)
      const crossed = r.prevS > len * 0.75 && s < len * 0.25;
      if (crossed && r.passedHalf && !r.finished) {
        if (r.lap > 0) {
          r.lastLap = (now - r.lapStart) / 1000;
          if (r.bestLap === 0 || r.lastLap < r.bestLap) r.bestLap = r.lastLap;
        }
        r.lap++;
        r.lapStart = now;
        r.passedHalf = false;
        if (r.lap > this.state.totalLaps) {
          r.finished = true;
          r.lap = this.state.totalLaps;
        }
      }
      r.prevS = s;
      r.progress = r.lap * len + s;
    }
    this.racers.sort((a, b) => b.progress - a.progress);
    if (this.racers.length && this.racers.every((r) => r.finished)) this.state.finished = true;
  }

  positionOf(r: Racer): number {
    return this.racers.indexOf(r) + 1;
  }

  curLapTime(r: Racer, now: number): number {
    if (!this.state.started || r.lap === 0) return 0;
    return (now - r.lapStart) / 1000;
  }

  /**
   * Time interval (seconds) to the car directly ahead and behind in the running
   * order, estimated from the on-track progress gap and a reference speed. null
   * when the racer is leading / running last.
   */
  gapInfo(r: Racer, refSpeed: number): { ahead: number | null; behind: number | null } {
    const i = this.racers.indexOf(r);
    const spd = Math.max(4, refSpeed); // avoid blowing up the gap at low speed
    const ahead = i > 0 ? (this.racers[i - 1].progress - r.progress) / spd : null;
    const behind = i < this.racers.length - 1 ? (r.progress - this.racers[i + 1].progress) / spd : null;
    return { ahead, behind };
  }
}
