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

describe("dikiş sürekliliği", () => {
  it("acos gürültü tabanı: atan2 hâli birebir aynı vektörde TAM 0 döner", () => {
    const v = new Float32Array([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
    const dot = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeGreaterThan(0.01);
    expect(angleBetweenDegrees(v[0], v[1], v[2], v[0], v[1], v[2])).toBe(0);
  });

  it("yükseklikler dikişte BİREBİR eşit — yaklaşık değil", () => {
    const height = makeHeightFn(P);
    const a = sampleChunkHeights(P, 0, 0, height);
    const b = sampleChunkHeights(P, 1, 0, height);
    let nonZero = 0;
    for (let j = 0; j <= P.segments; j++) {
      const av = a.data[(j + 1) * a.span + (P.segments + 1)];
      const bv = b.data[(j + 1) * b.span + 1];
      expect(av).toBe(bv); // toBeCloseTo DEĞİL
      if (av !== 0) nonZero++;
    }
    // Sıfır dizisini karşılaştırmıyoruz: kenar gerçekten arazi taşıyor.
    expect(nonZero).toBe(P.segments + 1);
  });

  it("alandan hesaplanan normaller dikişte TAM olarak eşleşir", () => {
    const height = makeHeightFn(P);
    const na = normalsFromHeights(P, sampleChunkHeights(P, 0, 0, height));
    const nb = normalsFromHeights(P, sampleChunkHeights(P, 1, 0, height));
    const report = compareNormalSeam(na, nb, vertexSpan(P), "east", "west");
    expect(report.samples).toBe(65);
    expect(report.maxDegrees).toBe(0);
    expect(report.meanDegrees).toBe(0);
  });

  it("computeVertexNormals AYNI dikişte KIRAR — iki yolun farkı testin kendisi", () => {
    const height = makeHeightFn(STEEP);
    const span = vertexSpan(STEEP);

    // ALAN yolu: halka tamponundan merkezî fark.
    const fa = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 0, 0, height));
    const fb = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 1, 0, height));
    const field = compareNormalSeam(fa, fb, span, "east", "west");

    // NAİF yol: chunk başına computeVertexNormals().
    const ma = buildNaiveChunkNormals(STEEP, 0, 0, height);
    const mb = buildNaiveChunkNormals(STEEP, 1, 0, height);
    const mesh = compareNormalSeam(ma, mb, span, "east", "west");

    expect(field.maxDegrees).toBe(0);
    expect(mesh.maxDegrees).toBeGreaterThan(1);
    expect(mesh.meanDegrees).toBeGreaterThan(0.1);

    // Kırılma dikişe ÖZGÜ: naif yolun İÇ vertex'i alan yoluyla neredeyse aynı.
    const mid = Math.floor(span / 2);
    const k = (mid * span + mid) * 3;
    const inner = angleBetweenDegrees(ma[k], ma[k + 1], ma[k + 2], fa[k], fa[k + 1], fa[k + 2]);
    expect(inner).toBeLessThan(mesh.maxDegrees);
  });

  it("kuzey-güney dikişi de aynı şekilde kapanır", () => {
    const height = makeHeightFn(P);
    const na = normalsFromHeights(P, sampleChunkHeights(P, 0, 0, height));
    const nb = normalsFromHeights(P, sampleChunkHeights(P, 0, 1, height));
    expect(compareNormalSeam(na, nb, vertexSpan(P), "south", "north").maxDegrees).toBe(0);
  });

  it("edgeIndices köşeleri iki kenarda da içerir", () => {
    const span = vertexSpan(P);
    expect(edgeIndices(span, "east")[0]).toBe(span - 1);
    expect(edgeIndices(span, "north")[span - 1]).toBe(span - 1);
    expect(edgeIndices(span, "west")).toHaveLength(span);
    // Batı ilk sütun, doğu son sütun; kuzey ilk satır, güney son satır.
    expect(edgeIndices(span, "west")[0]).toBe(0);
    expect(edgeIndices(span, "north")[0]).toBe(0);
    expect(edgeIndices(span, "south")[0]).toBe((span - 1) * span);
    expect(edgeIndices(span, "east")[span - 1]).toBe(span * span - 1);
  });

  it("angleBetweenDegrees bilinen açıları doğru veriyor", () => {
    expect(angleBetweenDegrees(1, 0, 0, 0, 1, 0)).toBeCloseTo(90, 12);
    expect(angleBetweenDegrees(1, 0, 0, -1, 0, 0)).toBeCloseTo(180, 12);
    const s = Math.SQRT1_2;
    expect(angleBetweenDegrees(1, 0, 0, s, s, 0)).toBeCloseTo(45, 12);
  });

  it("dikişte normaller BİLEŞEN BAZINDA eşit (açı 0 çıksın diye değil, gerçekten)", () => {
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
      if (na[p + 1] < 0.999) tilted++; // düz zemin değil, gerçek eğim var
    }
    expect(tilted).toBeGreaterThan(span / 2);
  });

  it("taşma halkası da dikişi kapatır (analitik türev gerektirmeden)", () => {
    const height = makeHeightFn(STEEP);
    const span = vertexSpan(STEEP);
    const ra = buildRingChunkNormals(STEEP, 0, 0, height);
    const rb = buildRingChunkNormals(STEEP, 1, 0, height);
    expect(compareNormalSeam(ra, rb, span, "east", "west").maxDegrees).toBe(0);

    // Ama halka yolu ALAN yoluyla aynı sayıyı vermez: biri mesh'e, öbürü alana bakıyor.
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

  it("dikiş raporu YANLIŞ kenar çiftinde 0 vermez — eşleştirme gerçekten iş yapıyor", () => {
    const height = makeHeightFn(STEEP);
    const span = vertexSpan(STEEP);
    const na = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 0, 0, height));
    const nb = normalsFromHeights(STEEP, sampleChunkHeights(STEEP, 1, 0, height));
    expect(compareNormalSeam(na, nb, span, "east", "west").maxDegrees).toBe(0);
    expect(compareNormalSeam(na, nb, span, "east", "east").maxDegrees).toBeGreaterThan(1);
  });

  it("compareHeightSeam: alan tabanlı pozisyonlarda 0, kaydırılmışta değil", () => {
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

    // Off-by-one'lı bir dünya: yüksekliği bir hücre kaydır → dikiş açılır.
    const posShift = toPositions(sampleChunkHeights(P, 0, 0, (x, z) => height(x + P.cellSize, z)));
    expect(compareHeightSeam(posA, posShift, span, "east", "east")).toBeGreaterThan(0);
  });
});
