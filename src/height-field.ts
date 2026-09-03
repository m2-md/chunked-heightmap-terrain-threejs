import { makeFbm } from "./noise.js";
import { chunkSize } from "./chunk-grid.js";

export interface TerrainParams {
  seed: number;
  segments: number; // quad count along chunk edge
  cellSize: number; // side length of a quad in world units
  amplitude: number; // peak height (world units)
  frequency: number; // world units -> noise space scale
  octaves: number;
  lacunarity: number;
  gain: number;
}

export const DEFAULT_TERRAIN: TerrainParams = {
  seed: 1337,
  segments: 64,
  cellSize: 1,
  amplitude: 12,
  frequency: 1 / 96,
  octaves: 5,
  lacunarity: 2,
  gain: 0.5,
};

export type HeightFn = (worldX: number, worldZ: number) => number;

/** Height from world coordinate. Pure function: same input -> same output everywhere. */
export function makeHeightFn(p: TerrainParams): HeightFn {
  const fbm = makeFbm(p.seed, p);
  return (worldX, worldZ) => fbm(worldX * p.frequency, worldZ * p.frequency) * p.amplitude;
}

export interface HeightPatch {
  /** (segments + 3)² heights. Local index range -1 .. segments+1. */
  data: Float32Array;
  /** Row length = segments + 3. */
  span: number;
}

/** Samples chunk heights along with a one-cell padding ring. */
export function sampleChunkHeights(
  p: TerrainParams,
  chunkX: number,
  chunkZ: number,
  height: HeightFn,
): HeightPatch {
  const span = p.segments + 3;
  const data = new Float32Array(span * span);
  const originX = chunkX * chunkSize(p);
  const originZ = chunkZ * chunkSize(p);

  for (let j = 0; j < span; j++) {
    const gz = j - 1; // -1 .. segments+1
    for (let i = 0; i < span; i++) {
      const gx = i - 1;
      data[j * span + i] = height(originX + gx * p.cellSize, originZ + gz * p.cellSize);
    }
  }
  return { data, span };
}

/** Normal via central differences from height buffer. Does not inspect mesh. */
export function normalsFromHeights(p: TerrainParams, patch: HeightPatch): Float32Array {
  const { data, span } = patch;
  const n = p.segments + 1;
  const out = new Float32Array(n * n * 3);
  const twoCell = 2 * p.cellSize;

  for (let j = 0; j < n; j++) {
    const fj = j + 1; // ring offset
    for (let i = 0; i < n; i++) {
      const fi = i + 1;
      const dx = (data[fj * span + fi + 1] - data[fj * span + fi - 1]) / twoCell;
      const dz = (data[(fj + 1) * span + fi] - data[(fj - 1) * span + fi]) / twoCell;
      const len = Math.hypot(-dx, 1, -dz);
      const k = (j * n + i) * 3;
      out[k] = -dx / len;
      out[k + 1] = 1 / len;
      out[k + 2] = -dz / len;
    }
  }
  return out;
}
