import { describe, expect, it } from "vitest";
import { amplitudeSum, makeFbm, makePermutation, makeValueNoise } from "../src/noise.js";
import { mulberry32 } from "../src/rng.js";
import { DEFAULT_TERRAIN, makeHeightFn } from "../src/height-field.js";

const FBM = { octaves: 5, lacunarity: 2, gain: 0.5 };

describe("seeded noise", () => {
  it("same seed -> bit-for-bit identical permutation", () => {
    expect(Array.from(makePermutation(1337))).toEqual(Array.from(makePermutation(1337)));
    expect(Array.from(makePermutation(1337))).not.toEqual(Array.from(makePermutation(1338)));
  });

  it("permutation is a genuine permutation of 0..255 and doubled to 512", () => {
    const perm = makePermutation(1337);
    expect(perm.length).toBe(512);
    expect([...new Set(perm.slice(0, 256))].length).toBe(256);
    for (let i = 0; i < 256; i++) expect(perm[i + 256]).toBe(perm[i]);
  });

  it("octave amplitude sum: gain 0.5 and 5 octaves -> 1.9375", () => {
    expect(amplitudeSum(FBM)).toBe(1.9375);
    expect(amplitudeSum({ ...FBM, octaves: 1 })).toBe(1);
    expect(amplitudeSum({ ...FBM, gain: 1 })).toBe(5);
  });

  it("fBm normalized: does not exceed [-1, 1] across 20,000 samples", () => {
    const fbm = makeFbm(1337, FBM);
    for (let i = 0; i < 20_000; i++) {
      const v = fbm((i % 211) * 0.37, Math.floor(i / 211) * 0.53);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("value noise repeats at grid corners (256 period)", () => {
    const noise = makeValueNoise(1337);
    expect(noise(3, 7)).toBe(noise(3 + 256, 7 + 256));
  });

  it("mulberry32 gives same sequence for same seed, different for different seed", () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    const c = mulberry32(1338);
    const seqA = Array.from({ length: 16 }, () => a());
    const seqB = Array.from({ length: 16 }, () => b());
    const seqC = Array.from({ length: 16 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("same seed -> BIT-FOR-BIT identical height array; different seed -> different", () => {
    const sample = (seed: number) => {
      const h = makeHeightFn({ ...DEFAULT_TERRAIN, seed });
      const out = new Float64Array(4096);
      for (let k = 0; k < out.length; k++) {
        out[k] = h((k % 64) * 1.5 - 32, Math.floor(k / 64) * 1.5 - 32);
      }
      return out;
    };
    const a = sample(1337);
    const b = sample(1337);
    const c = sample(1338);

    // Bit-for-bit comparison: raw bytes of Float64Array.
    expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
    expect(new Uint8Array(a.buffer)).not.toEqual(new Uint8Array(c.buffer));

    // and none of them are constant.
    expect(new Set(a).size).toBeGreaterThan(1000);
  });

  it("as fBm octave count increases total amplitude converges to amplitudeSum", () => {
    // 1 + 0.5 + 0.25 + ... -> 2. Each additional octave halves the remaining difference.
    expect(amplitudeSum({ ...FBM, octaves: 10 })).toBeCloseTo(2 - 2 ** -9, 12);
    expect(amplitudeSum({ ...FBM, octaves: 2 })).toBe(1.5);
    expect(amplitudeSum({ ...FBM, octaves: 3 })).toBe(1.75);
    expect(amplitudeSum({ ...FBM, octaves: 4 })).toBe(1.875);
    // lacunarity DOES NOT enter amplitude sum — only gain and octaves.
    expect(amplitudeSum({ octaves: 5, lacunarity: 3.7, gain: 0.5 })).toBe(1.9375);
  });

  it("fBm range overflows if normalization divisor omitted — that is divisor's job", () => {
    const noise = makeValueNoise(1337);
    const norm = amplitudeSum(FBM);
    let maxRaw = 0;
    for (let i = 0; i < 5_000; i++) {
      const x = (i % 71) * 0.31;
      const z = Math.floor(i / 71) * 0.43;
      let sum = 0;
      let amp = 1;
      let freq = 1;
      for (let o = 0; o < FBM.octaves; o++) {
        sum += noise(x * freq, z * freq) * amp;
        amp *= FBM.gain;
        freq *= FBM.lacunarity;
      }
      maxRaw = Math.max(maxRaw, Math.abs(sum));
    }
    // Un-divided sum EXCEEDS 1 (confirming division is necessary)...
    expect(maxRaw).toBeGreaterThan(1);
    // ...and enters the range after division.
    expect(maxRaw / norm).toBeLessThanOrEqual(1);
  });
});
