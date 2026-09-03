/**
 * Dikiş ölçümü — tarayıcısız. Üç normal yolunu aynı dikişte karşılaştırır ve
 * makaledeki "Dikişte maks. normal farkı" tablosunu üretir.
 *
 *   npm run seam
 *
 * Ölçülen her sayı saf aritmetikten çıkıyor: WebGL, GPU, canvas yok.
 */
import { vertexSpan } from "./chunk-grid.js";
import {
  DEFAULT_TERRAIN,
  makeHeightFn,
  normalsFromHeights,
  sampleChunkHeights,
  type TerrainParams,
} from "./height-field.js";
import { buildNaiveChunkNormals, buildRingChunkNormals } from "./chunk-mesh.js";
import { angleBetweenDegrees, compareHeightSeam, compareNormalSeam, type Edge } from "./seam.js";
import { Terrain, internalSeamPairs } from "./terrain.js";

const STEEP: TerrainParams = { ...DEFAULT_TERRAIN, amplitude: 24, frequency: 1 / 48 };

type NormalFn = (p: TerrainParams, cx: number, cz: number) => Float32Array;

function fieldNormals(p: TerrainParams, cx: number, cz: number): Float32Array {
  return normalsFromHeights(p, sampleChunkHeights(p, cx, cz, makeHeightFn(p)));
}

function meshNormals(p: TerrainParams, cx: number, cz: number): Float32Array {
  return buildNaiveChunkNormals(p, cx, cz, makeHeightFn(p));
}

function ringNormals(p: TerrainParams, cx: number, cz: number): Float32Array {
  return buildRingChunkNormals(p, cx, cz, makeHeightFn(p));
}

function heightPositions(p: TerrainParams, cx: number, cz: number): Float32Array {
  const patch = sampleChunkHeights(p, cx, cz, makeHeightFn(p));
  const span = vertexSpan(p);
  const out = new Float32Array(span * span * 3);
  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      out[(j * span + i) * 3 + 1] = patch.data[(j + 1) * patch.span + (i + 1)];
    }
  }
  return out;
}

function measurePair(
  p: TerrainParams,
  normals: NormalFn,
  edgeA: Edge,
  edgeB: Edge,
  b: [number, number],
) {
  const span = vertexSpan(p);
  const na = normals(p, 0, 0);
  const nb = normals(p, b[0], b[1]);
  const report = compareNormalSeam(na, nb, span, edgeA, edgeB);
  const dh = compareHeightSeam(
    heightPositions(p, 0, 0),
    heightPositions(p, b[0], b[1]),
    span,
    edgeA,
    edgeB,
  );
  return { ...report, maxHeight: dh };
}

const deg = (v: number) => (v === 0 ? "0 (tam)" : `${v.toFixed(4)}°`);
const num = (v: number) => (v === 0 ? "0" : v.toExponential(3));

function table(title: string, p: TerrainParams) {
  console.log(
    `\n### ${title}  (segments ${p.segments}, amplitude ${p.amplitude}, frequency 1/${Math.round(1 / p.frequency)})`,
  );
  console.log("| Yaklaşım | Dikişte maks. normal farkı | Ortalama | Dikişte yükseklik farkı |");
  console.log("|---|---|---|---|");
  const rows: Array<[string, NormalFn]> = [
    ["computeVertexNormals() (chunk başına)", meshNormals],
    ["Taşma halkası + computeVertexNormals()", ringNormals],
    ["Alandan merkezî fark", fieldNormals],
  ];
  for (const [label, fn] of rows) {
    const ew = measurePair(p, fn, "east", "west", [1, 0]);
    const ns = measurePair(p, fn, "south", "north", [0, 1]);
    const maxDeg = Math.max(ew.maxDegrees, ns.maxDegrees);
    const meanDeg = Math.max(ew.meanDegrees, ns.meanDegrees);
    const maxH = Math.max(ew.maxHeight, ns.maxHeight);
    console.log(`| \`${label}\` | ${deg(maxDeg)} | ${deg(meanDeg)} | ${num(maxH)} |`);
  }
  console.log(
    `(doğu-batı ve kuzey-güney dikişlerinin en kötüsü · kenar başına ${vertexSpan(p)} örnek)`,
  );
}

function acosNoiseFloor() {
  const v = new Float32Array([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
  const dot = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const acosDeg = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
  console.log("\n### acos gürültü tabanı (birebir aynı float32 birim vektör)");
  console.log(`  dot          = ${dot.toPrecision(17)}`);
  console.log(`  acos(dot)    = ${acosDeg.toFixed(6)}°   ← sahte fark`);
  console.log(`  2·atan2(...) = 0°                 ← doğru cevap`);
}

function gridArithmetic() {
  const p = DEFAULT_TERRAIN;
  const span = vertexSpan(p);
  const ring = p.segments + 3;
  console.log("\n### Izgara aritmetiği (yapısal — ölçüm değil)");
  console.log(`  chunk vertex ızgarası  (N+1)² = ${span}² = ${span * span}`);
  console.log(`  halka ızgarası         (N+3)² = ${ring}² = ${ring * ring}`);
  console.log(
    `  fazla örnekleme        %${(((ring * ring) / (span * span) - 1) * 100).toFixed(2)}`,
  );
  console.log(
    `  fazla üçgen            %${(((2 * (ring - 1) ** 2) / (2 * p.segments ** 2) - 1) * 100).toFixed(2)}`,
  );
  console.log(`  chunk başına üçgen     ${2 * p.segments ** 2}`);
  console.log(`  9 chunk toplam üçgen   ${9 * 2 * p.segments ** 2}`);
  console.log(`  9 chunk saklanan vtx   ${9 * span * span}`);
  const distinct = (3 * p.segments + 1) ** 2;
  console.log(`  dünyada farklı konum   ${distinct} (${3 * p.segments + 1}²)`);
  console.log(`  çakışan vertex         ${9 * span * span - distinct}`);
  const idxBytes = 6 * p.segments ** 2 * 2;
  console.log(`  paylaşılan index       ${idxBytes} B · paylaşılmasa ${idxBytes * 9} B`);
}

/**
 * Merkezî fark adımı süpürmesi. Ölçüt: halka yönteminin ürettiği alan ağırlıklı
 * normal — yani "mesh'in gerçekten çizdiği yüzeyin" normali. Alan tabanlı normal
 * ona en çok hangi adımda yaklaşıyor?
 */
function stepSweep() {
  const p = DEFAULT_TERRAIN;
  const height = makeHeightFn(p);
  const span = vertexSpan(p);
  const ring = buildRingChunkNormals(p, 0, 0, height);

  const withStep = (step: number): Float32Array => {
    const out = new Float32Array(span * span * 3);
    for (let j = 0; j < span; j++) {
      for (let i = 0; i < span; i++) {
        const x = j * 0 + i * p.cellSize; // yerel = dünya (chunk 0,0)
        const z = j * p.cellSize;
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

  const meanToRing = (n: Float32Array) => {
    let sum = 0;
    for (let k = 0; k < n.length; k += 3) {
      sum += angleBetweenDegrees(n[k], n[k + 1], n[k + 2], ring[k], ring[k + 1], ring[k + 2]);
    }
    return sum / (n.length / 3);
  };
  const meanY = (n: Float32Array) => {
    let s = 0;
    for (let k = 1; k < n.length; k += 3) s += n[k];
    return s / (n.length / 3);
  };

  console.log("\n### Merkezî fark adımı süpürmesi (ölçüt: halka = mesh'in kendi normali)");
  console.log("| Merkezî fark adımı | Halka normalinden ortalama sapma | Ortalama normal Y |");
  console.log("|---|---|---|");
  const cases: Array<[string, number]> = [
    ["cellSize / 8", p.cellSize / 8],
    ["cellSize / 2", p.cellSize / 2],
    ["cellSize", p.cellSize],
    ["cellSize × 2", p.cellSize * 2],
    ["cellSize × 4", p.cellSize * 4],
  ];
  for (const [label, step] of cases) {
    const n = withStep(step);
    console.log(`| \`${label}\` | ${meanToRing(n).toFixed(4)}° | ${meanY(n).toFixed(5)} |`);
  }

  // Gönderilen hâl (halka tamponundan okunan merkezî fark) ve YANLIŞ bölen.
  const shipped = normalsFromHeights(p, sampleChunkHeights(p, 0, 0, height));
  console.log(
    `| **gönderilen kod** (adım = cellSize) | **${meanToRing(shipped).toFixed(4)}°** | ${meanY(shipped).toFixed(5)} |`,
  );

  const patch = sampleChunkHeights(p, 0, 0, height);
  const wrong = new Float32Array(span * span * 3);
  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      const fi = i + 1;
      const fj = j + 1;
      // BÖLEN YANLIŞ: 2*cellSize yerine cellSize → gradyan iki katı.
      const dx =
        (patch.data[fj * patch.span + fi + 1] - patch.data[fj * patch.span + fi - 1]) / p.cellSize;
      const dz =
        (patch.data[(fj + 1) * patch.span + fi] - patch.data[(fj - 1) * patch.span + fi]) /
        p.cellSize;
      const len = Math.hypot(-dx, 1, -dz);
      const k = (j * span + i) * 3;
      wrong[k] = -dx / len;
      wrong[k + 1] = 1 / len;
      wrong[k + 2] = -dz / len;
    }
  }
  console.log(
    `| yanlış bölen (\`cellSize\`) | ${meanToRing(wrong).toFixed(4)}° | ${meanY(wrong).toFixed(5)} |`,
  );
}

function fullGridSeams() {
  const t = new Terrain(DEFAULT_TERRAIN);
  console.log("\n### 3×3 ızgaranın BÜTÜN iç dikişleri");
  console.log(`  iç dikiş sayısı: ${internalSeamPairs().length}`);
  for (const source of ["field", "ring", "mesh"] as const) {
    const r = t.seamReport(source);
    console.log(
      `  ${source.padEnd(6)} → maks ${deg(r.maxDegrees).padEnd(10)} · yükseklik ${num(r.maxHeight)}`,
    );
  }
  t.disposeAll();
}

console.log("=== DİKİŞ ÖLÇÜMÜ — tarayıcısız, deterministik ===");
gridArithmetic();
acosNoiseFloor();
table("Varsayılan arazi (DEFAULT_TERRAIN)", DEFAULT_TERRAIN);
table("Dik arazi (STEEP — testlerin kullandığı ön ayar)", STEEP);
stepSweep();
fullGridSeams();
console.log("\n=== bitti ===");
