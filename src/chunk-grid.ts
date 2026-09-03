import type { TerrainParams } from "./height-field.js";

/** Side length of a single chunk in world units. */
export function chunkSize(p: TerrainParams): number {
  return p.segments * p.cellSize;
}

/** Vertex count along chunk edge: N quads -> N+1 vertices. */
export function vertexSpan(p: TerrainParams): number {
  return p.segments + 1;
}

export function vertexCount(p: TerrainParams): number {
  const n = vertexSpan(p);
  return n * n;
}

export function triangleCount(p: TerrainParams): number {
  return 2 * p.segments * p.segments;
}

/**
 * Chunk index + local grid index -> world coordinate.
 * Chunk origin advances by `segments * cellSize` — NOT `(segments + 1) * cellSize`.
 * Getting this wrong opens exactly a 1-cell gap between chunks.
 */
export function worldXOf(p: TerrainParams, chunkX: number, i: number): number {
  return chunkX * chunkSize(p) + i * p.cellSize;
}

export function worldZOf(p: TerrainParams, chunkZ: number, j: number): number {
  return chunkZ * chunkSize(p) + j * p.cellSize;
}

/**
 * Grid topology. SHARED between chunks — position/normal change,
 * this stays constant. If vertex count does not exceed 65,536, Uint16 is sufficient.
 */
export function buildIndices(segments: number): Uint16Array | Uint32Array {
  const span = segments + 1;
  const total = span * span;
  const out =
    total > 65_536
      ? new Uint32Array(segments * segments * 6)
      : new Uint16Array(segments * segments * 6);

  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * span + i;
      const b = a + 1;
      const c = a + span;
      const d = c + 1;
      out[k++] = a;
      out[k++] = c;
      out[k++] = b;
      out[k++] = b;
      out[k++] = c;
      out[k++] = d;
    }
  }
  return out;
}
