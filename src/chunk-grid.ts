import type { TerrainParams } from "./height-field.js";

/** Bir chunk'ın dünya birimi cinsinden kenar uzunluğu. */
export function chunkSize(p: TerrainParams): number {
  return p.segments * p.cellSize;
}

/** Chunk kenarındaki vertex sayısı: N quad → N+1 vertex. */
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
 * Chunk indeksi + yerel ızgara indeksi → dünya koordinatı.
 * Chunk kökeni `segments * cellSize` adımlarla ilerler — `(segments + 1) * cellSize` DEĞİL.
 * Yanlışını yazarsanız chunk'lar arasında tam bir hücre boşluk açılır.
 */
export function worldXOf(p: TerrainParams, chunkX: number, i: number): number {
  return chunkX * chunkSize(p) + i * p.cellSize;
}

export function worldZOf(p: TerrainParams, chunkZ: number, j: number): number {
  return chunkZ * chunkSize(p) + j * p.cellSize;
}

/**
 * Izgara topolojisi. Chunk'lar arasında PAYLAŞILIR — pozisyon/normal değişir,
 * bu değişmez. Vertex sayısı 65.536'yı aşmıyorsa Uint16 yeter.
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
