import { describe, expect, it } from "vitest";
import { Terrain, internalSeamPairs, CHUNKS_X, CHUNKS_Z } from "../src/terrain.js";
import { DEFAULT_TERRAIN } from "../src/height-field.js";
import { chunkSize, triangleCount, vertexCount } from "../src/chunk-grid.js";

const P = DEFAULT_TERRAIN;

describe("3×3 terrain", () => {
  it("3×3 grid has 12 internal seams (6 east-west + 6 north-south)", () => {
    const pairs = internalSeamPairs();
    expect(pairs).toHaveLength(12);
    expect(pairs.filter((p) => p.edgeA === "east")).toHaveLength(6);
    expect(pairs.filter((p) => p.edgeA === "south")).toHaveLength(6);
    // Edge count formula: rows*(cols-1) + cols*(rows-1)
    expect(internalSeamPairs(5, 5)).toHaveLength(5 * 4 + 5 * 4);
    expect(internalSeamPairs(1, 1)).toHaveLength(0);
  });

  it("nine chunks created, index shared, positions separate", () => {
    const t = new Terrain(P);
    expect(t.chunkGeometries).toHaveLength(CHUNKS_X * CHUNKS_Z);
    for (const g of t.chunkGeometries) expect(g.index).toBe(t.sharedIndex);
    expect(new Set(t.chunkGeometries.map((g) => g.attributes.position)).size).toBe(9);

    const size = chunkSize(P);
    expect(t.meshes[0].position.toArray()).toEqual([0, 0, 0]);
    expect(t.meshes[8].position.toArray()).toEqual([2 * size, 0, 2 * size]);
    t.disposeAll();
  });

  it("FIELD normals exact 0 across all internal seams, MESH normals discontinuous", () => {
    const t = new Terrain(P);
    const field = t.seamReport("field");
    const mesh = t.seamReport("mesh");
    const ring = t.seamReport("ring");

    expect(field.seams).toBe(12);
    expect(field.maxDegrees).toBe(0);
    expect(field.maxHeight).toBe(0);
    expect(ring.maxDegrees).toBe(0);
    expect(mesh.maxDegrees).toBeGreaterThan(0.5);
    expect(mesh.maxHeight).toBe(0); // heights identical in all modes — issue is with normals
    t.disposeAll();
  });

  it("setNormalSource DOES NOT change positions, updates normals", () => {
    const t = new Terrain(P);
    const posBefore = Float32Array.from(t.positionsOf(4));
    const nrmBefore = Float32Array.from(
      t.chunkGeometries[4].attributes.normal.array as Float32Array,
    );

    t.setNormalSource("mesh");
    expect(t.currentNormalSource).toBe("mesh");
    expect(Array.from(t.positionsOf(4))).toEqual(Array.from(posBefore));
    expect(t.chunkGeometries[4].attributes.normal.array).not.toEqual(nrmBefore);

    t.setNormalSource("field");
    expect(Array.from(t.chunkGeometries[4].attributes.normal.array as Float32Array)).toEqual(
      Array.from(nrmBefore),
    );
    t.disposeAll();
  });

  it("mergeChunks: 38,025 vertices, 73,728 triangles, Uint32 index, world-offset position", () => {
    const t = new Terrain(P);
    const merged = t.mergeChunks();
    const total = CHUNKS_X * CHUNKS_Z;

    expect(merged.attributes.position.count).toBe(total * vertexCount(P)); // 38.025
    expect(merged.attributes.position.count).toBe(38_025);
    expect(merged.index?.count).toBe(total * 24_576);
    expect((merged.index!.array as Uint32Array).BYTES_PER_ELEMENT).toBe(4);
    expect(merged.index!.count / 3).toBe(total * triangleCount(P)); // 73.728
    expect(merged.index!.count / 3).toBe(73_728);
    expect(merged.boundingSphere).not.toBeNull();

    // first vertex of last chunk is at world (2*64, ?, 2*64).
    const pos = merged.attributes.position.array as Float32Array;
    const base = 8 * vertexCount(P) * 3;
    expect(pos[base]).toBe(2 * chunkSize(P));
    expect(pos[base + 2]).toBe(2 * chunkSize(P));

    // Indices are shifted per chunk and do not overflow bounds.
    let max = 0;
    for (const v of merged.index!.array as Uint32Array) if (v > max) max = v;
    expect(max).toBe(total * vertexCount(P) - 1);

    merged.dispose();
    t.disposeAll();
  });

  it("merged geometry has single bounding sphere, chunked approach has nine", () => {
    const t = new Terrain(P);
    const merged = t.mergeChunks();
    const spheres = t.chunkGeometries.map((g) => g.boundingSphere!.radius);
    expect(spheres).toHaveLength(9);
    // Merged sphere radius significantly larger than single chunk sphere:
    // loss of culling granularity is precisely this.
    expect(merged.boundingSphere!.radius).toBeGreaterThan(Math.max(...spheres) * 2);
    merged.dispose();
    t.disposeAll();
  });

  it("disposeAll cleans up completely — no chunks remain", () => {
    const t = new Terrain(P);
    expect(t.group.children.length).toBe(9);
    t.disposeAll();
    expect(t.group.children.length).toBe(0);
    expect(t.chunkGeometries).toHaveLength(0);
    expect(t.meshes).toHaveLength(0);
  });

  it("Math.random nowhere in codebase — determinism guarantee", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const roots = ["src", "tests"];
    const hits: string[] = [];
    for (const root of roots) {
      for (const f of readdirSync(root)) {
        if (!f.endsWith(".ts")) continue;
        const text = readFileSync(join(root, f), "utf8");
        // Exclude own file: do not count string in this test source.
        if (f === "terrain.test.ts") continue;
        if (text.includes("Math." + "random")) hits.push(join(root, f));
      }
    }
    expect(hits).toEqual([]);
  });
});
