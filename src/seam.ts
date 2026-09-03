/**
 * İki birim vektör arasındaki açı (derece). 2·atan2(|a-b|, |a+b|).
 * acos'un aksine sıfıra yakın açılarda hassasiyet kaybetmez: birebir aynı iki
 * float32 vektörde TAM 0 döner, acos ise ~0,015° gürültü verir.
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

/** Bir chunk'ın verilen kenarındaki vertex indeksleri, artan sırada. */
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

/** İki komşu chunk'ın paylaştığı kenarda normal sürekliliği. */
export function compareNormalSeam(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  span: number,
  edgeA: Edge,
  edgeB: Edge,
): SeamReport {
  const ia = edgeIndices(span, edgeA);
  const ib = edgeIndices(span, edgeB);
  if (ia.length !== ib.length) throw new RangeError("kenar uzunlukları eşleşmiyor");

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
 * Aynı kenardaki yükseklik farkı (maksimum mutlak). Saf fonksiyondan gelen
 * yükseklikler için sonuç TAM 0'dır — bu bir ölçüm değil, sözleşmenin sonucu.
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
  if (ia.length !== ib.length) throw new RangeError("kenar uzunlukları eşleşmiyor");

  let max = 0;
  for (let k = 0; k < ia.length; k++) {
    const d = Math.abs(a[ia[k] * 3 + 1] - b[ib[k] * 3 + 1]);
    if (d > max) max = d;
  }
  return max;
}
