import { describe, expect, it } from "vitest";
import {
  buildIndices,
  chunkSize,
  triangleCount,
  vertexCount,
  vertexSpan,
  worldXOf,
  worldZOf,
} from "../src/chunk-grid.js";
import { DEFAULT_TERRAIN } from "../src/height-field.js";

const P = DEFAULT_TERRAIN; // segments 64, cellSize 1

describe("chunk ızgara aritmetiği", () => {
  it("N quad → N+1 vertex, 2N² üçgen", () => {
    expect(vertexSpan(P)).toBe(65);
    expect(vertexCount(P)).toBe(4225);
    expect(triangleCount(P)).toBe(8192);
    expect(buildIndices(P.segments).length).toBe(24_576);
  });

  it("komşu chunk'lar kenar vertex'ini PAYLAŞIR", () => {
    // A'nın son sütunu ile B'nin ilk sütunu aynı dünya X'i
    expect(worldXOf(P, 0, P.segments)).toBe(worldXOf(P, 1, 0));
    expect(worldXOf(P, 0, P.segments)).toBe(64);
    expect(chunkSize(P)).toBe(64);
  });

  it("off-by-one: kökeni vertexSpan ile çarpmak bir hücre boşluk açar", () => {
    const wrong = (cx: number, i: number) => cx * vertexSpan(P) * P.cellSize + i * P.cellSize;
    expect(wrong(0, P.segments)).toBe(64);
    expect(wrong(1, 0)).toBe(65); // ← 1 hücrelik yarık
    expect(wrong(1, 0) - wrong(0, P.segments)).toBe(P.cellSize);
  });

  it("index tamponu vertex sayısını aşmaz ve her üçgeni bir kez üretir", () => {
    const idx = buildIndices(P.segments);
    expect(idx.BYTES_PER_ELEMENT).toBe(2); // 4225 vertex → Uint16 yeter
    let max = 0;
    for (const v of idx) if (v > max) max = v;
    expect(max).toBe(vertexCount(P) - 1);
    expect(idx.length / 3).toBe(triangleCount(P));
  });

  it("büyük chunk Uint32'ye geçer", () => {
    expect(buildIndices(256).BYTES_PER_ELEMENT).toBe(4); // 257² = 66.049
    expect(buildIndices(255).BYTES_PER_ELEMENT).toBe(2); // 256² = 65.536
  });

  it("N×N vertex ızgarası → 2(N−1)² üçgen (birkaç boyutta)", () => {
    for (const n of [2, 3, 5, 16, 65]) {
      const segments = n - 1; // N vertex → N-1 quad
      const idx = buildIndices(segments);
      expect(idx.length / 3).toBe(2 * (n - 1) * (n - 1));
      expect(vertexSpan({ ...P, segments })).toBe(n);
      expect(vertexCount({ ...P, segments })).toBe(n * n);
    }
  });

  it("chunk indeksi ↔ dünya koordinatı gidiş-dönüş tutarlı", () => {
    const size = chunkSize(P);
    for (const cx of [-2, -1, 0, 1, 3]) {
      for (const i of [0, 1, 32, 63, 64]) {
        const wx = worldXOf(P, cx, i);
        expect(wx).toBe(cx * 64 + i);
        // Dünya X'inden chunk indeksine dönüş (kenar vertex'i sağdaki chunk'a düşer).
        expect(Math.floor(wx / size)).toBe(i === P.segments ? cx + 1 : cx);
      }
    }
    // Z ekseni X ile aynı aritmetiği kullanıyor.
    for (const cz of [-1, 0, 2]) {
      for (const j of [0, 7, 64]) expect(worldZOf(P, cz, j)).toBe(worldXOf(P, cz, j));
    }
    // cellSize 1 değilken de çalışır.
    const Q = { ...P, cellSize: 0.5 };
    expect(chunkSize(Q)).toBe(32);
    expect(worldXOf(Q, 0, Q.segments)).toBe(worldXOf(Q, 1, 0));
  });

  it("üçgenleme köşegeni HER quad'da aynı yönde (b–c)", () => {
    const segments = 4;
    const span = segments + 1;
    const idx = buildIndices(segments);
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const q = (j * segments + i) * 6;
        const a = j * span + i;
        expect(Array.from(idx.slice(q, q + 6))).toEqual([
          a,
          a + span,
          a + 1,
          a + 1,
          a + span,
          a + span + 1,
        ]);
      }
    }
  });
});
