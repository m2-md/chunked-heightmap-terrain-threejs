import { mulberry32 } from "./rng.js";

/** 0..255 permutation shuffled with Fisher-Yates from seed, doubled to 512. */
export function makePermutation(seed: number): Uint8Array {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

export type Noise2D = (x: number, z: number) => number;

/** Seeded 2D value noise. Return range [-1, 1]. */
export function makeValueNoise(seed: number): Noise2D {
  const perm = makePermutation(seed);
  const lattice = new Float32Array(256);
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  for (let i = 0; i < 256; i++) lattice[i] = rng() * 2 - 1;

  const at = (xi: number, zi: number) => lattice[perm[(perm[xi & 255] + (zi & 255)) & 255]];
  // Perlin's quintic fade: first and second derivatives zero at endpoints.
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  return function value(x: number, z: number): number {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const u = fade(x - xi);
    const v = fade(z - zi);
    const a = at(xi, zi);
    const b = at(xi + 1, zi);
    const c = at(xi, zi + 1);
    const d = at(xi + 1, zi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

export interface FbmOptions {
  octaves: number;
  lacunarity: number;
  gain: number;
}

/** Sum of octave amplitudes — normalization divisor. gain=0.5, 5 octaves -> 1.9375. */
export function amplitudeSum(options: FbmOptions): number {
  let sum = 0;
  let amp = 1;
  for (let o = 0; o < options.octaves; o++) {
    sum += amp;
    amp *= options.gain;
  }
  return sum;
}

export function makeFbm(seed: number, options: FbmOptions): Noise2D {
  const noise = makeValueNoise(seed);
  const norm = amplitudeSum(options);
  const { octaves, lacunarity, gain } = options;

  return function fbm(x: number, z: number): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, z * freq) * amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}
