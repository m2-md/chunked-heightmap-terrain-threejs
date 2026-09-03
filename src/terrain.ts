import * as THREE from "three";
import { buildIndices, chunkSize, vertexCount, vertexSpan } from "./chunk-grid.js";
import {
  makeHeightFn,
  type HeightFn,
  type TerrainParams,
  DEFAULT_TERRAIN,
} from "./height-field.js";
import { buildFieldChunk, buildNaiveChunkNormals, buildRingChunkNormals } from "./chunk-mesh.js";
import { compareHeightSeam, compareNormalSeam, type Edge } from "./seam.js";

/** Normal kaynağı. `field` = alandan merkezî fark, `mesh` = computeVertexNormals. */
export type NormalSource = "field" | "mesh" | "ring";

/** Geometri modu. `chunked` = chunk başına bir mesh, `merged` = tek dev geometry. */
export type GeometryMode = "chunked" | "merged";

export const CHUNKS_X = 3;
export const CHUNKS_Z = 3;

export interface SeamSummary {
  /** Karşılaştırılan iç dikiş sayısı (3×3 ızgarada 12). */
  seams: number;
  /** Dikişteki en büyük normal açı farkı (derece). */
  maxDegrees: number;
  /** Dikişteki en büyük mutlak yükseklik farkı (dünya birimi). */
  maxHeight: number;
}

interface SeamPair {
  a: number;
  b: number;
  edgeA: Edge;
  edgeB: Edge;
}

/** 3×3 ızgaranın iç dikişleri: 6 doğu-batı + 6 kuzey-güney = 12. */
export function internalSeamPairs(cols = CHUNKS_X, rows = CHUNKS_Z): SeamPair[] {
  const pairs: SeamPair[] = [];
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx + 1 < cols; cx++) {
      pairs.push({ a: cz * cols + cx, b: cz * cols + cx + 1, edgeA: "east", edgeB: "west" });
    }
  }
  for (let cx = 0; cx < cols; cx++) {
    for (let cz = 0; cz + 1 < rows; cz++) {
      pairs.push({
        a: cz * cols + cx,
        b: (cz + 1) * cols + cx,
        edgeA: "south",
        edgeB: "north",
      });
    }
  }
  return pairs;
}

/**
 * 3×3 chunk'lık arazi. Index tamponu DOKUZ geometride tek bir `BufferAttribute`
 * nesnesi olarak paylaşılır; pozisyon/normal/uv chunk başına ayrıdır.
 */
export class Terrain {
  readonly params: TerrainParams;
  readonly height: HeightFn;
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;

  readonly chunkGeometries: THREE.BufferGeometry[] = [];
  readonly meshes: THREE.Mesh[] = [];
  readonly sharedIndex: THREE.BufferAttribute;

  private readonly normalSets: Record<NormalSource, Float32Array[]> = {
    field: [],
    mesh: [],
    ring: [],
  };
  private mergedGeometry: THREE.BufferGeometry | null = null;
  private mergedMesh: THREE.Mesh | null = null;
  private normalSource: NormalSource = "field";
  private geometryMode: GeometryMode = "chunked";

  constructor(params: TerrainParams = DEFAULT_TERRAIN) {
    this.params = params;
    this.height = makeHeightFn(params);
    this.sharedIndex = new THREE.BufferAttribute(buildIndices(params.segments), 1);
    this.material = new THREE.MeshStandardMaterial({
      color: 0x8ea3b8,
      roughness: 0.75,
      metalness: 0,
      flatShading: false,
    });

    const size = chunkSize(params);
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const geometry = buildFieldChunk(params, cx, cz, this.height, this.sharedIndex);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.set(cx * size, 0, cz * size);
        mesh.name = `chunk-${cx}-${cz}`;
        this.chunkGeometries.push(geometry);
        this.meshes.push(mesh);
        this.group.add(mesh);

        // FIELD normalleri geometrinin içinde zaten var; kopyasını saklıyoruz.
        const field = geometry.attributes.normal.array as Float32Array;
        this.normalSets.field.push(new Float32Array(field));
        this.normalSets.mesh.push(buildNaiveChunkNormals(params, cx, cz, this.height));
        this.normalSets.ring.push(buildRingChunkNormals(params, cx, cz, this.height));
      }
    }
  }

  get currentNormalSource(): NormalSource {
    return this.normalSource;
  }

  get currentGeometryMode(): GeometryMode {
    return this.geometryMode;
  }

  /** Şu anda chunk geometrilerinde duran normal dizileri. */
  normalsFor(source: NormalSource = this.normalSource): readonly Float32Array[] {
    return this.normalSets[source];
  }

  positionsOf(chunkIndex: number): Float32Array {
    return this.chunkGeometries[chunkIndex].attributes.position.array as Float32Array;
  }

  /** Normal kaynağını değiştirir. Pozisyonlara DOKUNMAZ — fark yalnızca aydınlatmada. */
  setNormalSource(source: NormalSource): void {
    if (source === this.normalSource) return;
    this.normalSource = source;
    const set = this.normalSets[source];
    for (let k = 0; k < this.chunkGeometries.length; k++) {
      const attr = this.chunkGeometries[k].attributes.normal as THREE.BufferAttribute;
      (attr.array as Float32Array).set(set[k]);
      attr.needsUpdate = true;
    }
    if (this.mergedGeometry) this.refreshMergedNormals();
  }

  setGeometryMode(mode: GeometryMode): void {
    if (mode === this.geometryMode) return;
    this.geometryMode = mode;
    if (mode === "merged") {
      if (!this.mergedMesh) {
        this.mergedGeometry = this.mergeChunks();
        this.mergedMesh = new THREE.Mesh(this.mergedGeometry, this.material);
        this.mergedMesh.name = "merged";
      } else {
        this.refreshMergedNormals();
      }
      for (const mesh of this.meshes) mesh.visible = false;
      this.group.add(this.mergedMesh);
      this.mergedMesh.visible = true;
    } else {
      if (this.mergedMesh) this.mergedMesh.visible = false;
      for (const mesh of this.meshes) mesh.visible = true;
    }
  }

  /**
   * Dokuz chunk'ı TEK bir `BufferGeometry`'ye birleştirir. Pozisyonlara chunk ofseti
   * EKLENİR (artık `mesh.position` yok), index'ler `chunkIndex * vertexCount` ile
   * kaydırılır. 3×3'te 38.025 vertex hâlâ Uint16 sınırının altında ama index tamponu
   * bilerek `Uint32Array`: ızgarayı 5×5 yapan biri sessiz bozulma yaşamasın.
   */
  mergeChunks(): THREE.BufferGeometry {
    const p = this.params;
    const perChunk = vertexCount(p);
    const size = chunkSize(p);
    const total = this.chunkGeometries.length;

    const positions = new Float32Array(total * perChunk * 3);
    const normals = new Float32Array(total * perChunk * 3);
    const uvs = new Float32Array(total * perChunk * 2);
    const srcIndex = this.sharedIndex.array as Uint16Array | Uint32Array;
    const indices = new Uint32Array(total * srcIndex.length);

    for (let k = 0; k < total; k++) {
      const cx = k % CHUNKS_X;
      const cz = Math.floor(k / CHUNKS_X);
      const geometry = this.chunkGeometries[k];
      const srcPos = geometry.attributes.position.array as Float32Array;
      const srcNrm = geometry.attributes.normal.array as Float32Array;
      const srcUv = geometry.attributes.uv.array as Float32Array;
      const base = k * perChunk;

      for (let v = 0; v < perChunk; v++) {
        positions[(base + v) * 3] = srcPos[v * 3] + cx * size;
        positions[(base + v) * 3 + 1] = srcPos[v * 3 + 1];
        positions[(base + v) * 3 + 2] = srcPos[v * 3 + 2] + cz * size;
        normals[(base + v) * 3] = srcNrm[v * 3];
        normals[(base + v) * 3 + 1] = srcNrm[v * 3 + 1];
        normals[(base + v) * 3 + 2] = srcNrm[v * 3 + 2];
        uvs[(base + v) * 2] = srcUv[v * 2];
        uvs[(base + v) * 2 + 1] = srcUv[v * 2 + 1];
      }
      for (let t = 0; t < srcIndex.length; t++) {
        indices[k * srcIndex.length + t] = srcIndex[t] + base;
      }
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    merged.computeBoundingSphere(); // unutulursa culling ölçümü anlamsızlaşır
    return merged;
  }

  private refreshMergedNormals(): void {
    if (!this.mergedGeometry) return;
    const perChunk = vertexCount(this.params);
    const dst = this.mergedGeometry.attributes.normal as THREE.BufferAttribute;
    const arr = dst.array as Float32Array;
    const set = this.normalSets[this.normalSource];
    for (let k = 0; k < set.length; k++) arr.set(set[k], k * perChunk * 3);
    dst.needsUpdate = true;
  }

  /** İç dikişlerde normal ve yükseklik sürekliliği — canlı tamponlardan okunur. */
  seamReport(source: NormalSource = this.normalSource): SeamSummary {
    const span = vertexSpan(this.params);
    const normals = this.normalSets[source];
    const pairs = internalSeamPairs();
    let maxDegrees = 0;
    let maxHeight = 0;

    for (const { a, b, edgeA, edgeB } of pairs) {
      const report = compareNormalSeam(normals[a], normals[b], span, edgeA, edgeB);
      if (report.maxDegrees > maxDegrees) maxDegrees = report.maxDegrees;
      const dh = compareHeightSeam(this.positionsOf(a), this.positionsOf(b), span, edgeA, edgeB);
      if (dh > maxHeight) maxHeight = dh;
    }
    return { seams: pairs.length, maxDegrees, maxHeight };
  }

  /**
   * TOPLU yıkım. Paylaşılan index attribute'u dokuz geometride ortak olduğu için
   * chunk'ları teker teker `dispose()` etmek `onGeometryDispose` üzerinden ortak
   * GPU tamponunu siler ve kalanlar bir sonraki karede sessizce yeniden yükler.
   */
  disposeAll(): void {
    this.group.clear();
    for (const geometry of this.chunkGeometries) geometry.dispose();
    this.chunkGeometries.length = 0;
    this.meshes.length = 0;
    this.mergedGeometry?.dispose();
    this.mergedGeometry = null;
    this.mergedMesh = null;
    this.material.dispose();
  }
}
