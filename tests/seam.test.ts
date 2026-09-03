import { describe, expect, it } from "vitest";
import {
  angleBetweenDegrees,
  compareHeightSeam,
  compareNormalSeam,
  edgeIndices,
} from "../src/seam.js";
import {
  DEFAULT_TERRAIN,
  makeHeightFn,
  normalsFromHeights,
  sampleChunkHeights,
} from "../src/height-field.js";
import { buildNaiveChunkNormals, buildRingChunkNormals } from "../src/chunk-mesh.js";
import { vertexSpan } from "../src/chunk-grid.js";

const P = DEFAULT_TERRAIN;
const STEEP = { ...P, amplitude: 24, frequency: 1 / 48 };

describe("seam continuity", () => {
  it("acos noise floor: atan2 returns exact 0 for identical vectors", () => {
    const v = new Float32Array([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
    const dot = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeGreaterThan(0.01);
    expect(angleBetweenDegrees(v[0], v[1], v[2], v[0], v[1], v[2])).toBe(0);
  });

  it("heights are EXACTLY equal across the seam — not approximate", () => {
    const height = makeHeightFn(P);
    const a = sampleChunkHeights(P, 0, 0, height);
    const b = sampleChunkHeights(P, 1, 0, height);
    let nonZero = 0;
    for (let j = 0; j <= P.segments; j++) {
      const av = a.data[(j + 1) * a.span + (P.segments + 1)];
      const bv = b.data[(j + 1) * b.span + 1];
      expect(av).toBe(bv); // NOT toBeCloseTo
      if (av !== 0) nonZero++;
    }
    // not comparing a zero array: boundary actually carries terrain.
    expect(nonZero).toBe(P.segments + 1);
  });

  it("field-derived normals match exactly across the seam", () => {
    const height = makeHeightFn(P);
    const na = normalsFromHeights(P, sampleChunkHeights(P, 0, 0, height));
    const nb = normalsFromHeights(P, sampleChunkHeights(P, 1, 0, height));
    const report = compareNormalSeam(na, nb, vertexSpan(P), "east", "west");
    expect(report.samples).toBe(65);
    expect(report.maxDegrees).toBe(0);
    expect(report.meanDegrees).toBe(0);
  });

  it("computeVertexNormals BREAKS across the same seam — difference between two approaches is the test", () => {
    const height = makeHeightFn(STEEP);
    const span = vertexSpan(STEEP);

    // FIELD approach: central difference from ring buffer.
    const fa = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 0, 0, height));
    const fb = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 1, 0, height));
    const field = compareNormalSeam(fa, fb, span, "east", "west");

    // NAIVE approach: per-chunk computeVertexNormals().
    const ma = buildNaiveChunkNormals(STEEP, 0, 0, height);
    const mb = buildNaiveChunkNormals(STEEP, 1, 0, height);
    const mesh = compareNormalSeam(ma, mb, span, "east", "west");

    expect(field.maxDegrees).toBe(0);
    expect(mesh.maxDegrees).toBeGreaterThan(1);
    expect(mesh.meanDegrees).toBeGreaterThan(0.1);

    // Seam-specific discontinuity: naive approach interior vertices match field approach closely.
    const mid = Math.floor(span / 2);
    const k = (mid * span + mid) * 3;
    const inner = angleBetweenDegrees(ma[k], ma[k + 1], ma[k + 2], fa[k], fa[k + 1], fa[k + 2]);
    expect(inner).toBeLessThan(mesh.maxDegrees);
  });

  it("north-south seam seals in the same manner", () => {
    const height = makeHeightFn(P);
    const na = normalsFromHeights(P, sampleChunkHeights(P, 0, 0, height));
    const nb = normalsFromHeights(P, sampleChunkHeights(P, 0, 1, height));
    expect(compareNormalSeam(na, nb, vertexSpan(P), "south", "north").maxDegrees).toBe(0);
  });

  it("edgeIndices includes corners on both adjacent edges", () => {
    const span = vertexSpan(P);
    expect(edgeIndices(span, "east")[0]).toBe(span - 1);
    expect(edgeIndices(span, "north")[span - 1]).toBe(span - 1);
    expect(edgeIndices(span, "west")).toHaveLength(span);
    // West is first column, east is last column; north is first row, south is last row.
    expect(edgeIndices(span, "west")[0]).toBe(0);
    expect(edgeIndices(span, "north")[0]).toBe(0);
    expect(edgeIndices(span, "south")[0]).toBe((span - 1) * span);
    expect(edgeIndices(span, "east")[span - 1]).toBe(span * span - 1);
  });

  it("angleBetweenDegrees gives correct known angles", () => {
    expect(angleBetweenDegrees(1, 0, 0, 0, 1, 0)).toBeCloseTo(90, 12);
    expect(angleBetweenDegrees(1, 0, 0, -1, 0, 0)).toBeCloseTo(180, 12);
    const s = Math.SQRT1_2;
    expect(angleBetweenDegrees(1, 0, 0, s, s, 0)).toBeCloseTo(45, 12);
  });

  it("normals across seam match COMPONENT-BY-COMPONENT (not just 0 angle, exact equality)", () => {
    const height = makeHeightFn(P);
    const span = vertexSpan(P);
    const na = normalsFromHeights(P, sampleChunkHeights(P, 0, 0, height));
    const nb = normalsFromHeights(P, sampleChunkHeights(P, 1, 0, height));
    const ia = edgeIndices(span, "east");
    const ib = edgeIndices(span, "west");
    let tilted = 0;
    for (let k = 0; k < span; k++) {
      const p = ia[k] * 3;
      const q = ib[k] * 3;
      expect(na[p]).toBe(nb[q]);
      expect(na[p + 1]).toBe(nb[q + 1]);
      expect(na[p + 2]).toBe(nb[q + 2]);
      if (na[p + 1] < 0.999) tilted++; // not flat ground, real slope exists
    }
    expect(tilted).toBeGreaterThan(span / 2);
  });

  it("padding ring also closes seam (without analytical derivatives)", () => {
    const height = makeHeightFn(STEEP);
    const span = vertexSpan(STEEP);
    const ra = buildRingChunkNormals(STEEP, 0, 0, height);
    const rb = buildRingChunkNormals(STEEP, 1, 0, height);
    expect(compareNormalSeam(ra, rb, span, "east", "west").maxDegrees).toBe(0);

    // But ring approach does not give identical values to field approach: one looks at mesh, other at field.
    const fa = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 0, 0, height));
    let maxDiff = 0;
    for (let k = 0; k < ra.length; k += 3) {
      maxDiff = Math.max(
        maxDiff,
        angleBetweenDegrees(ra[k], ra[k + 1], ra[k + 2], fa[k], fa[k + 1], fa[k + 2]),
      );
    }
    expect(maxDiff).toBeGreaterThan(0);
  });

  it("seam report does not yield 0 on incorrect edge pair — matching actually does work", () => {
    const height = makeHeightFn(STEEP);
    const span = vertexSpan(STEEP);
    const na = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 0, 0, height));
    const nb = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 1, 0, height));
    expect(compareNormalSeam(na, nb, span, "east", "west").maxDegrees).toBe(0);
    expect(compareNormalSeam(na, nb, span, "east", "east").maxDegrees).toBeGreaterThan(1);
  });

  it("compareHeightSeam: 0 on patch-based positions, non-zero when shifted", () => {
    const height = makeHeightFn(P);
    const span = vertexSpan(P);
    const toPositions = (patch: { data: Float32Array; span: number }) => {
      const out = new Float32Array(span * span * 3);
      for (let j = 0; j < span; j++) {
        for (let i = 0; i < span; i++) {
          out[(j * span + i) * 3 + 1] = patch.data[(j + 1) * patch.span + (i + 1)];
        }
      }
      return out;
    };
    const posA = toPositions(sampleChunkHeights(P, 0, 0, height));
    const posB = toPositions(sampleChunkHeights(P, 1, 0, height));
    expect(compareHeightSeam(posA, posB, span, "east", "west")).toBe(0);

    // Off-by-one world: shift height by one cell -> seam opens.
    const posShift = toPositions(sampleChunkHeights(P, 0, 0, (x, z) => height(x + P.cellSize, z)));
    expect(compareHeightSeam(posA, posShift, span, "east", "east")).toBeGreaterThan(0);
  });
});
