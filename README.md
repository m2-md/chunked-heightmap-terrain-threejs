# Terrain Splits, Light Does Not — Seams in Chunked Heightmap Terrain

<!-- LINKS:BEGIN — üretildi: scripts/sync-repo-links.py · elle düzenleme -->
**▶ [Live demo](https://m2-md.github.io/chunked-heightmap-terrain-threejs/)** · [Source](https://github.com/m2-md/chunked-heightmap-terrain-threejs)
<!-- LINKS:END -->

> Infinite chunked procedural heightmap terrain in Three.js: seeded value noise + fBm,
> chunk coordinate grid arithmetic, and analytic heightfield normal continuity.

Working code for the article "Terrain Splits, Light Does Not: Computing the Normal from
the Field Instead of the Mesh in Chunked Heightmap Terrain". It contains three things:

1. **A core decoupled from rendering** (`src/rng.ts` · `noise.ts` · `height-field.ts` ·
   `chunk-grid.ts` · `seam.ts`) — seeded value noise + fBm, chunk grid arithmetic, a
   height buffer with a padding ring, normals from the field by central difference, and a
   seam meter. No dependencies, no WebGL, no `Math.random()`.
2. **Three normal paths** (`src/chunk-mesh.ts`) — naive `computeVertexNormals()`, padding
   ring (skirt), central difference from the field. All three are measured on the same
   seam.
3. **A lightweight demo** (`index.html` + `src/main.ts`) — 3×3 chunks, 64 segments, three
   keys. No automatic sweep, no post-processing, no shadows.

## Versions

| Package | Version |
|---|---|
| `three` (+ `@types/three`) | 0.185.1 (r185) |
| TypeScript | 5.9 (strict) |
| Vite | 6 |
| Vitest | 2.1 |

Package manager is **npm** (ADR-001). No noise library is PULLED IN — the noise is written
by hand.

## Install

```bash
npm install
```

## Test

```bash
npm test
```

**43 tests must be green** (5 files, ~0.7 s). None of them wants a browser, a canvas or a
GPU.

| File | Tests | What it proves |
|---|---|---|
| `tests/noise.test.ts` | 9 | same seed → bit-for-bit identical permutation **and** bit-for-bit identical height array (raw `Float64Array` bytes); different seed → different · the permutation really is a permutation of 0..255 and is folded to 512 · octave amplitude sum is `1.9375` (also for 2/3/4 octaves, and independence from `lacunarity`) · fBm never leaves `[-1,1]` across 20,000 samples · with the divisor removed the raw sum DOES EXCEED 1 (i.e. the divisor does real work) · the lattice period is 256 |
| `tests/chunk-grid.test.ts` | 8 | N quads → N+1 vertices, 2N² triangles · **N×N vertices → 2(N−1)² triangles** (at 5 sizes) · a neighbouring chunk shares the edge vertex · **chunk index ↔ world coordinate** round trip (including negative indices and `cellSize ≠ 1`) · the MAGNITUDE of an off-by-one error is exactly one `cellSize` · index limit/type (255 → 2 bytes, 256 → 4 bytes) · the triangulation diagonal runs the same way in every quad |
| `tests/seam.test.ts` | 11 | acos noise floor vs `2·atan2` · **height at the seam via `toBe` (not approximately)** plus proof that the 65 compared values really carry terrain · **normals at the seam are equal component by component** (`toBe`, in x, y and z) · **naive `computeVertexNormals()` BREAKS on the SAME seam** (both paths in a single test, side by side) · the padding ring also gives 0 but does not give the same number as the field path · the north-south seam · the wrong edge pair does not give 0 |
| `tests/chunk-mesh.test.ts` | 7 | touching triangle counts (interior 6 · edge 3 · diagonal tip 1) · the shared index is ONE object, the positions are 9 separate ones · attribute shapes + unit normals · heights are not sampled twice · `PlaneGeometry` + `rotateX(-90°)` row order · **a central difference step of `cellSize` gives the normal closest to the mesh** (against four alternatives) |
| `tests/terrain.test.ts` | 8 | 12 internal seams in a 3×3 · nine chunks + shared index · **FIELD is 0 on all 12 seams, MESH is broken** · `setNormalSource` does not touch positions · `mergeChunks` gives 38,025 vertices / 73,728 triangles / a `Uint32` index / a world offset · the merged geometry has ONE bounding sphere · `disposeAll` in bulk · there is no `Math.random` in the code |

### Are the tests actually protective? — a mutation round

Every claim was tested by breaking it ("break the claim → it must go red → revert").
**15 out of 15 mutations were caught.** What was tried:

| # | Mutation | Result |
|---|---|---|
| M1 | Let the `worldXOf` origin advance in `chunkSize + cellSize` steps (off-by-one) | 3 tests red |
| M2 | Sample the ring buffer from LOCAL instead of WORLD coordinates | 10 tests red |
| M3 | Ring width `segments + 2` instead of `segments + 3` | 7 tests red |
| M4 | `angleBetweenDegrees` using `acos(dot)` instead of `2·atan2` | 7 tests red |
| M5 | Index type limit `>= 65_536` instead of `> 65_536` | 1 test red |
| M6 | Remove the `makeFbm` normalization divisor | 1 test red |
| M7 | Let `amplitudeSum` ignore `gain` | 2 tests red |
| M8 | Rotate `PlaneGeometry` with `rotateX(+90°)` | 2 tests red |
| M9 | Let `mergeChunks` skip adding the chunk offset to the index | 1 test red |
| M10 | Let every chunk build its own index buffer (no sharing) | 2 tests red |
| M11 | Let the triangle diagonal vary per quad (break global consistency) | 2 tests red |
| M12 | Do not normalize the normals | 2 tests red |
| M13 | Central difference divisor `cellSize` instead of `2 * cellSize` | 1 test red |
| M14 | Let `buildFieldChunk` read the height without the ring offset | 1 test red |
| M15 | Let `mergeChunks` skip computing the bounding sphere | 1 test red |

M13 **stayed green** in the first round — the article's claim "make the step equal to the
cell size" had no guard. The step sweep test in `tests/chunk-mesh.test.ts` was written for
exactly that; after it, 15/15.

## Measurement (browserless)

```bash
npm run seam
```

**Every degree value** in the article comes out of this command. The measurement is pure
arithmetic: no WebGL, no GPU, no canvas.

```
### Grid arithmetic (structural — not measured)
  chunk vertex grid      (N+1)² = 65² = 4225
  ring grid              (N+3)² = 67² = 4489
  oversampling           6.25%
  extra triangles        6.35%
  9 chunks stored vtx    38025 · distinct world coords 37249 (193²) · overlapping 776
  shared index           49152 B · unshared 442368 B

### acos noise floor (identical float32 unit vectors)
  dot = 0.99999996410353731 · acos(dot) = 0.015352° · 2·atan2(...) = 0°

### Default terrain (segments 64, amplitude 12, frequency 1/96)
| computeVertexNormals() (per chunk)     | 4.3980° | mean 2.1292° | height 0 |
| Padding ring + computeVertexNormals()  | 0 (exact) | 0 (exact)  | 0 |
| Central difference from field          | 0 (exact) | 0 (exact)  | 0 |

### Steep terrain (STEEP — amplitude 24, frequency 1/48)
| computeVertexNormals() | 32.0232° | mean 10.2652° | 0 |

### Central difference step sweep (benchmark: ring = mesh own normal)
| cellSize / 8 | 0.3630° |   | cellSize × 2 | 0.7046° |
| cellSize / 2 | 0.2917° |   | cellSize × 4 | 2.2587° |
| cellSize     | 0.1124° | ← the minimum is here
| wrong divisor (cellSize) | 8.4038° |

### ALL internal seams of the 3×3 grid (12 seams)
  field → 0 (exact) · ring → 0 (exact) · mesh → 6.7131°
```

Which number comes from which command:

| Number | Command |
|---|---|
| Every degree in the seam table (4.3980 · 2.1292 · 32.0232 · 6.7131 · 0) | `npm run seam` |
| acos noise floor (`0.99999996410353731` → `0.015352°`) | `npm run seam` (also `tests/seam.test.ts`) |
| The central difference step table (0.3630 · 0.2917 · 0.1124 · 0.7046 · 2.2587 · 8.4038) | `npm run seam` (also `tests/chunk-mesh.test.ts`) |
| Grid numbers (4225 · 8192 · 24576 · 38025 · 37249 · 776 · 73728 · 49152 · 6.25% · 6.35%) | `npm run seam` + `npm test` — structural, not measured |
| fBm amplitude sum `1.9375` | `npm test` |
| Test count 43 | `npm test` |

**What `npm run seam` cannot measure:** draw calls · drawn triangles · geometry count.
Those want `renderer.info`, i.e. a real WebGL context. Those three numbers were measured in
the browser in the demo with the `M` key and written into the article's table that way —
3×3 separate chunks with all of them in frame `9 / 73,728 / 9`, with one out of frame
`8 / 65,536 / 9`, a single merged geometry `1 / 73,728 / 10` (geometry is 10 because the
demo keeps both modes at once). You can repeat it on your own machine with `npm run dev` +
`M`. Nothing was guessed.

## Demo (lightweight)

```bash
npm run dev        # → http://localhost:5216/
```

> **DO NOT open it with `file://`.** If you double-click `index.html` the ES modules will
> not resolve and you will see a black screen. The Vite dev server is mandatory.

The demo is deliberately lightweight: 3×3 chunks, 64 segments per edge, 73,728 triangles
in total. No shadows, no post-processing, no automatic sweep. **You** trigger the
measurement.

| Key | Job |
|---|---|
| `N` | Normal source: **FIELD** (central difference from the field) ↔ **MESH** (`computeVertexNormals`). Positions do not change — the difference is only in the lighting. |
| `G` | Geometry mode: **CHUNKED** (3×3 separate meshes) ↔ **MERGED** (one merged geometry) |
| `M` | Measurement: read the `renderer.info` counters + compute the seam report + write it to the HUD |

Every cell in the HUD is labelled, because mixing the two up is the easiest way to fool
yourself:

- `MEASUREMENT` → what was actually read/computed in that frame: `renderer.info.render.calls`,
  `.triangles`, `renderer.info.memory.geometries`, plus `SEAM MAX` and `SEAM HEIGHT`
  computed from the live normal buffers.
- `STRUCTURAL` → from the grid arithmetic in the code: chunk count, vertices/triangles per
  chunk, the byte size of the shared index buffer.

The `M` measurement is taken **after** a `renderer.render()` call; since `info.render` is
reset at the start of every `render()`, reading it before would put you one frame behind.

## Build

```bash
npm run build      # tsc && vite build
npm run preview
```

## Tech stack

- TypeScript
- Three.js r185 (WebGL)
- Vite / vite-node
- Vitest

## File layout

```
src/
  rng.ts           # mulberry32 — seeded generator
  noise.ts         # makePermutation · makeValueNoise (quintic fade) · amplitudeSum · makeFbm
  height-field.ts  # TerrainParams · makeHeightFn · sampleChunkHeights ((N+3)² ring)
                   # · normalsFromHeights (central difference)
  chunk-grid.ts    # chunkSize · vertexSpan/Count · triangleCount · worldXOf/ZOf · buildIndices
  chunk-mesh.ts    # buildNaiveChunk(+Normals) · buildRingChunkNormals · buildFieldChunk
  seam.ts          # angleBetweenDegrees (2·atan2) · edgeIndices · compareNormalSeam
                   # · compareHeightSeam
  terrain.ts       # Terrain: 3×3 setup, shared index, mergeChunks, seamReport, disposeAll
  measure-seam.ts  # npm run seam — produces every degree value in the article
  main.ts          # demo: renderer, scene, HUD, N/G/M
tests/             # 5 files, 43 tests — none of them opens a browser
```

## Three details worth noting

1. **The ring method also gives exactly 0 at the seam.** Before measuring it I expected
   "good enough". The reason: the edge vertex stays in the interior of the ring grid, and so
   do all six of its neighbouring triangles; because `computeVertexNormals()` walks the
   index buffer in quad order, even the summation order comes out bit-for-bit identical in
   both chunks. What kills the ring is not the seam, it is LOD.
2. **The `RangeError` branch inside `compareNormalSeam` is unreachable.** The function
   produces both edges with the same `span`, so the lengths are always equal. It stays there
   to match the code in the article exactly; no test was written to exercise it (such a test
   would have been a tautology).
3. **The `lang` + `text-transform: uppercase` trap.** The HUD's English labels are already
   written in capitals in the source and there is NO `text-transform` in the CSS. If there
   were, and the page declared a Turkish locale, the browser would apply the Turkish
   uppercasing rule and show `VERTİCES` instead of `VERTICES`.

## License

MIT — `LICENSE`.
