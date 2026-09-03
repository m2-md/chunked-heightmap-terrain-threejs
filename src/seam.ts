/**
 * Angle between two unit vectors (degrees). 2·atan2(|a-b|, |a+b|).
 * Unlike acos, does not lose precision near zero: returns exact 0 for
 * identical float32 vectors, whereas acos introduces ~0.015° noise.
 */
export function angleBetweenDegrees(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const sub = Math.hypot(ax - bx, ay - by, az - bz);
  const add = Math.hypot(ax + bx, ay + by, az + bz);
  return (2 * Math.atan2(sub, add) * 180) / Math.PI;
}

export type Edge = "east" | "west" | "north" | "south";

/** Vertex indices on the specified edge of a chunk, in ascending order. */
export function edgeIndices(span: number, edge: Edge): number[] {
  const out: number[] = [];
  for (let k = 0; k < span; k++) {
    switch (edge) {
      case "west":
        out.push(k * span + 0);
        break;
      case "east":
        out.push(k * span + (span - 1));
        break;
      case "north":
        out.push(0 * span + k);
        break;
      case "south":
        out.push((span - 1) * span + k);
        break;
    }
  }
  return out;
}

export interface SeamReport {
  samples: number;
  maxDegrees: number;
  meanDegrees: number;
}

/** Normal continuity along the edge shared by two neighboring chunks. */
export function compareNormalSeam(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  span: number,
  edgeA: Edge,
  edgeB: Edge,
): SeamReport {
  const ia = edgeIndices(span, edgeA);
  const ib = edgeIndices(span, edgeB);
  if (ia.length !== ib.length) throw new RangeError("edge lengths do not match");

  let max = 0;
  let sum = 0;
  for (let k = 0; k < ia.length; k++) {
    const p = ia[k] * 3;
    const q = ib[k] * 3;
    const deg = angleBetweenDegrees(a[p], a[p + 1], a[p + 2], b[q], b[q + 1], b[q + 2]);
    if (deg > max) max = deg;
    sum += deg;
  }
  return { samples: ia.length, maxDegrees: max, meanDegrees: sum / ia.length };
}

/**
 * Height difference along the same edge (maximum absolute). For heights
 * originating from a pure function, result is exact 0 — consequence of contract.
 */
export function compareHeightSeam(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  span: number,
  edgeA: Edge,
  edgeB: Edge,
): number {
  const ia = edgeIndices(span, edgeA);
  const ib = edgeIndices(span, edgeB);
  if (ia.length !== ib.length) throw new RangeError("edge lengths do not match");

  let max = 0;
  for (let k = 0; k < ia.length; k++) {
    const d = Math.abs(a[ia[k] * 3 + 1] - b[ib[k] * 3 + 1]);
    if (d > max) max = d;
  }
  return max;
}
