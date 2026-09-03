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
  it("interior vertex touches 6 triangles, edge 3, diagonal corner 1", () => {
    const span = vertexSpan(P);
    const counts = new Uint8Array(span * span);
    for (const v of buildIndices(P.segments)) counts[v]++;

    const mid = Math.floor(span / 2);
    expect(counts[mid * span + mid]).toBe(6); // interior
    expect(counts[mid * span + (span - 1)]).toBe(3); // east edge
    expect(counts[0]).toBe(1); // diagonal corner
    expect(counts[span * span - 1]).toBe(1); // opposite corner
    expect(counts[span - 1]).toBe(2);
  });

  it("shared index attribute is single instance across nine geometries", () => {
    const height = makeHeightFn(P);
    const shared = new THREE.BufferAttribute(buildIndices(P.segments), 1);
    const chunks: THREE.BufferGeometry[] = [];
    for (let z = 0; z < 3; z++)
      for (let x = 0; x < 3; x++) chunks.push(buildFieldChunk(P, x, z, height, shared));

    expect(chunks).toHaveLength(9);
    for (const g of chunks) expect(g.index).toBe(shared); // same INSTANCE
    expect(new Set(chunks.map((g) => g.attributes.position)).size).toBe(9);
    for (const g of chunks) g.dispose();
  });

  it("buildFieldChunk attribute shapes and unit normals", () => {
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

  it("buildFieldChunk does not sample heights TWICE — position Y comes from ring buffer", () => {
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
      expect(pos[k]).toBe(i * P.cellSize); // LOCAL X
      expect(pos[k + 2]).toBe(j * P.cellSize); // LOCAL Z
      expect(pos[k + 1]).toBe(patch.data[(j + 1) * patch.span + (i + 1)]);
      // and ring buffer is sampled from real WORLD coordinates.
      expect(pos[k + 1]).toBe(Math.fround(height(worldXOf(P, 1, i), worldZOf(P, 2, j))));
    }
    g.dispose();
  });

  it("PlaneGeometry + rotateX(-90°) row order: j -> +Z, i -> +X", () => {
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

  it("central difference step EQUAL to cellSize yields closest normals to mesh", () => {
    // Benchmark: ring method = weighted normal taken from mesh's OWN triangles,
    // i.e., "surface actually rendered on screen" normal. We measure how close
    // finite difference normal gets as a function of step size.
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

    // REDUCING step (approaching analytical derivative limit) DEVIATES from mesh.
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell / 2)));
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell / 8)));
    // INCREASING step also deviates — minimum is reached here from both sides.
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell * 2)));
    expect(errShipped).toBeLessThan(meanAngleToRing(withStep(cell * 4)));
    // and shipped version matches step = cellSize.
    expect(errShipped).toBeCloseTo(meanAngleToRing(withStep(cell)), 4);

    // Large step flattens terrain: normal Y component approaches 1.
    const meanY = (n: Float32Array) => {
      let s = 0;
      for (let k = 1; k < n.length; k += 3) s += n[k];
      return s / (n.length / 3);
    };
    expect(meanY(withStep(cell * 4))).toBeGreaterThan(meanY(shipped));
  });

  it("buildNaiveChunk produces same vertex/index counts as our grid", () => {
    const height = makeHeightFn(P);
    const g = buildNaiveChunk(P, 0, 0, height);
    expect(g.attributes.position.count).toBe(4225);
    expect(g.index?.count).toBe(24_576);
    expect(g.attributes.normal.count).toBe(4225);
    g.dispose();
  });
});
