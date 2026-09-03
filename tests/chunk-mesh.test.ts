import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildIndices, vertexSpan, worldXOf, worldZOf } from "../src/chunk-grid.js";
import {
  DEFAULT_TERRAIN,
  makeHeightFn,
  normalsFromHeights,
  sampleChunkHeights,
} from "../src/height-field.js";
import { buildFieldChunk, buildNaiveChunk, buildRingChunkNormals } from "../src/chunk-mesh.js";
import { angleBetweenDegrees } from "../src/seam.js";

const P = DEFAULT_TERRAIN;

describe("chunk mesh", () => {
  it("iç vertex 6, kenar vertex 3, köşegen ucundaki köşe 1 üçgene değer", () => {
    const span = vertexSpan(P);
    const counts = new Uint8Array(span * span);
    for (const v of buildIndices(P.segments)) counts[v]++;

    const mid = Math.floor(span / 2);
    expect(counts[mid * span + mid]).toBe(6); // iç
    expect(counts[mid * span + (span - 1)]).toBe(3); // doğu kenarı
    expect(counts[0]).toBe(1); // köşegen ucu
    expect(counts[span * span - 1]).toBe(1); // öbür uç
    expect(counts[span - 1]).toBe(2);
  });

  it("paylaşılan index attribute dokuz geometride TEK nesne", () => {
    const height = makeHeightFn(P);
    const shared = new THREE.BufferAttribute(buildIndices(P.segments), 1);
    const chunks: THREE.BufferGeometry[] = [];
    for (let z = 0; z < 3; z++)
      for (let x = 0; x < 3; x++) chunks.push(buildFieldChunk(P, x, z, height, shared));

    expect(chunks).toHaveLength(9);
    for (const g of chunks) expect(g.index).toBe(shared); // aynı NESNE
    expect(new Set(chunks.map((g) => g.attributes.position)).size).toBe(9);
    for (const g of chunks) g.dispose();
  });

  it("buildFieldChunk attribute şekilleri ve birim normaller", () => {
    const height = makeHeightFn(P);
    const shared = new THREE.BufferAttribute(buildIndices(P.segments), 1);
    const g = buildFieldChunk(P, 0, 0, height, shared);

    expect(g.attributes.position.count).toBe(4225);
    expect(g.attributes.position.itemSize).toBe(3);
    expect(g.attributes.normal.count).toBe(4225);
    expect(g.attributes.uv.count).toBe(4225);
    expect(g.attributes.uv.itemSize).toBe(2);
    expect(g.boundingSphere).not.toBeNull();

    const n = g.attributes.normal.array as Float32Array;
    let maxErr = 0;
    for (let k = 0; k < n.length; k += 3) {
      maxErr = Math.max(maxErr, Math.abs(Math.hypot(n[k], n[k + 1], n[k + 2]) - 1));
    }
    expect(maxErr).toBeLessThan(1e-5);
    g.dispose();
  });

  it("buildFieldChunk yükseklikleri İKİ KEZ örneklemez — pozisyon Y'si halka tamponundan", () => {
    const height = makeHeightFn(P);
    const shared = new THREE.BufferAttribute(buildIndices(P.segments), 1);
    const g = buildFieldChunk(P, 1, 2, height, shared);
    const pos = g.attributes.position.array as Float32Array;
    const patch = sampleChunkHeights(P, 1, 2, height);
    const span = vertexSpan(P);

    for (const [i, j] of [
      [0, 0],
      [1, 7],
      [32, 32],
      [64, 0],
      [64, 64],
    ]) {
      const k = (j * span + i) * 3;
      expect(pos[k]).toBe(i * P.cellSize); // YEREL X
      expect(pos[k + 2]).toBe(j * P.cellSize); // YEREL Z
      expect(pos[k + 1]).toBe(patch.data[(j + 1) * patch.span + (i + 1)]);
      // Ve halka tamponu gerçekten DÜNYA koordinatından örneklenmiş.
      expect(pos[k + 1]).toBe(Math.fround(height(worldXOf(P, 1, i), worldZOf(P, 2, j))));
    }
    g.dispose();
  });

  it("PlaneGeometry + rotateX(-90°) satır sırası: j → +Z, i → +X", () => {
    const Q = { ...P, segments: 2, cellSize: 1 };
    const flat = () => 0;
    const g = buildNaiveChunk(Q, 0, 0, flat);
    const pos = g.attributes.position.array as Float32Array;
    const span = vertexSpan(Q); // 3
    const half = (Q.segments * Q.cellSize) / 2; // 1

    for (let j = 0; j < span; j++) {
      for (let i = 0; i < span; i++) {
        const k = (j * span + i) * 3;
        expect(pos[k]).toBeCloseTo(-half + i * Q.cellSize, 6);
        expect(pos[k + 2]).toBeCloseTo(-half + j * Q.cellSize, 6);
      }
    }
    g.dispose();
  });

  it("merkezî fark adımı hücre boyutuna EŞİT olduğunda mesh'e en yakın normali verir", () => {
    // Ölçüt: halka yöntemi = mesh'in KENDİ üçgenlerinden alan ağırlıklı normal,
    // yani "ekranda gerçekten çizilen yüzeyin" normali. Alan tabanlı normalin ona
    // ne kadar yaklaştığını adım boyuna göre ölçüyoruz.
    const height = makeHeightFn(P);
    const span = vertexSpan(P);
    const ring = buildRingChunkNormals(P, 0, 0, height);

    const withStep = (step: number): Float32Array => {
      const out = new Float32Array(span * span * 3);
      for (let j = 0; j < span; j++) {
        for (let i = 0; i < span; i++) {
          const x = worldXOf(P, 0, i);
          const z = worldZOf(P, 0, j);
          const dx = (height(x + step, z) - height(x - step, z)) / (2 * step);
          const dz = (height(x, z + step) - height(x, z - step)) / (2 * step);
          const len = Math.hypot(-dx, 1, -dz);
          const k = (j * span + i) * 3;
          out[k] = -dx / len;
          out[k + 1] = 1 / len;
          out[k + 2] = -dz / len;
        }
      }
      return out;
    };

    const meanAngleToRing = (n: Float32Array): number => {
      let sum = 0;
      for (let k = 0; k < n.length; k += 3) {
        sum += angleBetweenDegrees(n[k], n[k + 1], n[k + 2], ring[k], ring[k + 1], ring[k + 2]);
      }
      return sum / (n.length / 3);
    };

    const shipped = normalsFromHeights(P, sampleChunkHeights(P, 0, 0, height));
    const cell = P.cellSize;
    const errShipped = meanAngleToRing(shipped);

    // Adımı KÜÇÜLTMEK (analitik türev sınırına gitmek) mesh'ten UZAKLAŞTIRIR.
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell / 2)));
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell / 8)));
    // Adımı BÜYÜTMEK de uzaklaştırır — iki yönde de minimum burada.
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell * 2)));
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell * 4)));
    // Ve gönderilen hâl gerçekten adım = cellSize ile aynı sonucu veriyor.
    expect(errShipped).toBeCloseTo(meanAngleToRing(withStep(cell)), 4);

    // Büyük adım araziyi DÜZ gösterir: normallerin Y bileşeni 1'e yaklaşır.
    const meanY = (n: Float32Array) => {
      let s = 0;
      for (let k = 1; k < n.length; k += 3) s += n[k];
      return s / (n.length / 3);
    };
    expect(meanY(withStep(cell * 4))).toBeGreaterThan(meanY(shipped));
  });

  it("buildNaiveChunk bizim ızgaramızla aynı vertex/index sayısını üretir", () => {
    const height = makeHeightFn(P);
    const g = buildNaiveChunk(P, 0, 0, height);
    expect(g.attributes.position.count).toBe(4225);
    expect(g.index?.count).toBe(24_576);
    expect(g.attributes.normal.count).toBe(4225);
    g.dispose();
  });
});
