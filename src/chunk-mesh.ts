import * as THREE from "three";
import { buildIndices, vertexSpan, worldXOf, worldZOf } from "./chunk-grid.js";
import {
  normalsFromHeights,
  sampleChunkHeights,
  type HeightFn,
  type TerrainParams,
} from "./height-field.js";

/** Herkesin ilk yazdığı hâli: PlaneGeometry + computeVertexNormals. Dikişte kırılır. */
export function buildNaiveChunk(
  p: TerrainParams,
  chunkX: number,
  chunkZ: number,
  height: HeightFn,
): THREE.BufferGeometry {
  const size = p.segments * p.cellSize;
  const geometry = new THREE.PlaneGeometry(size, size, p.segments, p.segments);
  geometry.rotateX(-Math.PI / 2); // XY düzleminden XZ zeminine

  const span = vertexSpan(p);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      const index = j * span + i;
      position.setY(index, height(worldXOf(p, chunkX, i), worldZOf(p, chunkZ, j)));
    }
  }
  position.needsUpdate = true;

  geometry.computeVertexNormals(); // ← dikiş tam olarak burada kırılıyor
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Naif yolun yalnızca normal dizisi. Testler ve ölçüm script'i bunu kullanıyor ki
 * `BufferGeometry` alanlarını didiklemek zorunda kalmasınlar.
 */
export function buildNaiveChunkNormals(
  p: TerrainParams,
  chunkX: number,
  chunkZ: number,
  height: HeightFn,
): Float32Array {
  const geometry = buildNaiveChunk(p, chunkX, chunkZ, height);
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const out = new Float32Array(normal.array as Float32Array);
  geometry.dispose();
  return out;
}

/**
 * Taşma halkası (skirt) yolu: (segments+3)² ızgara kurulur, `computeVertexNormals()`
 * ORADA çağrılır, sonra halka atılıp iç (segments+1)² normal saklanır.
 * Analitik türev gerektirmez — yükseklik kaynağı bir PNG ya da elle yontulmuş bir
 * mesh olsa da çalışır. Tek şartı sınırın bir hücre ötesini örnekleyebilmek.
 */
export function buildRingChunkNormals(
  p: TerrainParams,
  chunkX: number,
  chunkZ: number,
  height: HeightFn,
): Float32Array {
  const patch = sampleChunkHeights(p, chunkX, chunkZ, height);
  const ring = patch.span; // segments + 3 vertex
  const positions = new Float32Array(ring * ring * 3);

  for (let j = 0; j < ring; j++) {
    for (let i = 0; i < ring; i++) {
      const k = (j * ring + i) * 3;
      positions[k] = (i - 1) * p.cellSize; // YEREL — normaller ötelemeden bağımsız
      positions[k + 1] = patch.data[j * ring + i];
      positions[k + 2] = (j - 1) * p.cellSize;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(buildIndices(ring - 1), 1));
  geometry.computeVertexNormals();
  const wide = geometry.attributes.normal.array as Float32Array;

  const span = vertexSpan(p);
  const out = new Float32Array(span * span * 3);
  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      const src = ((j + 1) * ring + (i + 1)) * 3;
      const dst = (j * span + i) * 3;
      out[dst] = wide[src];
      out[dst + 1] = wide[src + 1];
      out[dst + 2] = wide[src + 2];
    }
  }
  geometry.dispose();
  return out;
}

export function buildFieldChunk(
  p: TerrainParams,
  chunkX: number,
  chunkZ: number,
  height: HeightFn,
  sharedIndex: THREE.BufferAttribute,
): THREE.BufferGeometry {
  const span = vertexSpan(p);
  const patch = sampleChunkHeights(p, chunkX, chunkZ, height);
  const normals = normalsFromHeights(p, patch);
  const positions = new Float32Array(span * span * 3);
  const uvs = new Float32Array(span * span * 2);

  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      const k = j * span + i;
      positions[k * 3] = i * p.cellSize; // YEREL koordinat
      positions[k * 3 + 1] = patch.data[(j + 1) * patch.span + (i + 1)];
      positions[k * 3 + 2] = j * p.cellSize;
      uvs[k * 2] = i / p.segments;
      uvs[k * 2 + 1] = j / p.segments;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(sharedIndex); // topoloji her chunk'ta AYNI
  geometry.computeBoundingSphere();
  return geometry;
}
