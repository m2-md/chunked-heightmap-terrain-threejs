# Arazi Bölünür, Işık Bölünmez: Chunk'lı Heightmap Arazide Normali Mesh'ten Değil Alandan Hesaplamak

*Yükseklikler bayt bayt eşleşir, pozisyonlar kusursuzdur, ama chunk sınırında ışık kırılır — çünkü kenar vertex'i komşusunu tanımıyor. Tohumlu noise + fBm'den chunk'lı araziye giden yolu kuruyor, dikişi derece cinsinden ölçüyor ve normali mesh'e değil yükseklik alanına sorarak kapatıyoruz.*

*Tahmini okuma süresi: 17 dakika*

---

Dokuz chunk'lık ilk arazimi kurduğumda on saniye boyunca her şey kusursuzdu. Tepeler yerli yerinde, vadiler akıyor, kamera süzülüyor. Sonra ışığı biraz yana aldım.

Ekranda bir futbol topu belirdi. Daha doğrusu dikişleri.

Chunk sınırlarının tam üstünde, arazinin üzerine çizilmiş gibi duran açık renkli çizgiler. Önce pozisyonlardan şüphelendim: chunk'lar bir hücre kayıyor olabilirdi. Kontrol ettim, kaymıyordu. Yükseklikleri karşılaştırdım: A chunk'ının sağ kenarındaki 65 yükseklik, B chunk'ının sol kenarındaki 65 yükseklikle bayt bayt aynıydı. Geometri kusursuzdu.

Kırılan şey geometri değildi, normaldi.

Bu yazının taşıyıcı görüntüsü bu: **duvar dibinde büyümüş ağaç.** Bir ağaç açıklıkta büyürse her yönden ışık alır, dik durur. Duvarın dibinde büyürse ışığı tek yandan alır ve o yöne eğilir. Ağacın suçu yok — eldeki bilgiyle doğru davranıyor. Chunk'ın kenarındaki vertex de aynı durumda: `computeVertexNormals()` ona "komşu üçgenlerin kim?" diye soruyor, o da sadece bir yandaki üçgenleri sayabiliyor. Diğer yanı başka bir `BufferGeometry`'nin içinde, o mesh'in haberi bile yok. Normal eğik çıkıyor. Komşu chunk aynı vertex için ters yöne eğik bir normal üretiyor. İkisi arasındaki fark, ekranda bir çizgi.

Çözüm duvarı yıkmak ya da hiç ağaca sormamak. İkisini de kuracağız.

Yol haritası şu. Önce chunk indeksinden dünya koordinatına geçiyoruz; orada saklanan off-by-one tuzağı bütün hesabı belirliyor. Sonra tohumlu bir noise + fBm üreteci yazıyoruz — kütüphane yok, `Math.random()` yok; B chunk'ının A'dan habersiz üretilip sınırda birebir aynı sayıyı vermesi ancak saf bir fonksiyonla mümkün. Ardından dikişi kırıp derece cinsinden ölçüyor, açı ölçmenin kendisinde saklı bir sayısal tuzağı görüyoruz. İki çözüm yolunu karşılaştırıp üçüncüde birleştiriyoruz. Sonra ikinci eksen: chunk başına bir geometry mi, tek dev geometry mi? En sonda hepsini tarayıcısız bir vitest paketiyle çivileyip demoya bakıyoruz.

Sürüm notu: `three@0.185.1` (r185), klasik `WebGLRenderer`, Vite + TypeScript + vitest. React ve R3F yok.

### Dokuz Pencere, Tek Manzara

Araziyi chunk'lara bölmek insana yanlış bir sezgi veriyor: sanki dünyayı dokuz parçaya ayırıyormuşuz gibi. Ayırmıyoruz.

Dünya tek bir height field (yükseklik alanı). Her dünya koordinatı için bir yükseklik döndüren, sonsuz ve sürekli bir fonksiyon. Chunk o alana açtığımız bir pencere — çerçeve bizim, manzara alanın. Bu ayrımı kaybedince dikiş sorunu çözülmez görünmeye başlıyor, çünkü pencereye manzarayı sormaya başlıyorsunuz.

Pencerenin ölçüsüyle başlayalım. Bir chunk `segments` tane quad içeriyorsa, kenarında `segments + 1` vertex vardır. Klasik çit-direği problemi: 64 tahta için 65 direk gerekir. Bu bir eksiklik değil, bilinçli bir tercih. Çünkü kenar direği komşu çitin de direğidir.

```ts
// src/chunk-grid.ts
import type { TerrainParams } from "./height-field.js";

/** Bir chunk'ın dünya birimi cinsinden kenar uzunluğu. */
export function chunkSize(p: TerrainParams): number {
  return p.segments * p.cellSize;
}

/** Chunk kenarındaki vertex sayısı: N quad → N+1 vertex. */
export function vertexSpan(p: TerrainParams): number {
  return p.segments + 1;
}

export function vertexCount(p: TerrainParams): number {
  const n = vertexSpan(p);
  return n * n;
}

export function triangleCount(p: TerrainParams): number {
  return 2 * p.segments * p.segments;
}

/**
 * Chunk indeksi + yerel ızgara indeksi → dünya koordinatı.
 * Chunk kökeni `segments * cellSize` adımlarla ilerler — `(segments + 1) * cellSize` DEĞİL.
 * Yanlışını yazarsanız chunk'lar arasında tam bir hücre boşluk açılır.
 */
export function worldXOf(p: TerrainParams, chunkX: number, i: number): number {
  return chunkX * chunkSize(p) + i * p.cellSize;
}

export function worldZOf(p: TerrainParams, chunkZ: number, j: number): number {
  return chunkZ * chunkSize(p) + j * p.cellSize;
}
```

`worldXOf`'un içindeki çarpan bu yazının ilk tuzağı. Chunk'ın kökeni `segments * cellSize` kadar ilerler. `vertexSpan` ile çarpmak sezgisel görünüyor — chunk'ta o kadar vertex var sonuçta. Ama o zaman A'nın son vertex sütunu ile B'nin ilk vertex sütunu **farklı** dünya koordinatlarına düşer ve aralarında tam bir hücre genişliğinde bir yarık açılır. Ekranda bu yarık ışık sızdırır; altından gökyüzü görürsünüz.

Doğrusunda ise A'nın son sütunu ile B'nin ilk sütunu tam olarak aynı dünya koordinatındadır. Aynı yerde iki vertex. Bellekte iki tane, dünyada bir tane.

Bu çakışmanın bedelini sayalım. Varsayılan ayarlarımızda chunk kenarı 64 segment, ızgara 3×3:

| Ölçü | Değer | Nereden |
|---|---|---|
| Chunk başına vertex | 4.225 | 65² |
| Chunk başına üçgen | 8.192 | 2 × 64² |
| Chunk başına index | 24.576 | 6 × 64² |
| 9 chunk'ta saklanan vertex | 38.025 | 9 × 4.225 |
| Dünyada farklı konum sayısı | 37.249 | 193² |
| Fazladan saklanan (çakışan) vertex | 776 | 38.025 − 37.249 |
| Toplam üçgen | 73.728 | 9 × 8.192 |

776 vertex, toplamın yüzde ikisi. Bu israfı ortadan kaldırmanın tek yolu chunk'ları tek bir vertex tamponunda birleştirmek — ki o zaman da chunk başına ayrı `BufferGeometry` fikri çöker. Yüzde ikilik bir bellek kazancı için neyi feda ettiğinize birazdan geleceğiz.

### Tohum: Aynı Sayı, Aynı Dünya

Yükseklik alanının saf bir fonksiyon olması, bu yazının bütün çözümünün dayandığı temel. Saf derken: aynı dünya koordinatını verdiğinizde, kim sorarsa sorsun, ne zaman sorarsa sorsun, hangi chunk'ın içinden sorarsa sorsun aynı sayıyı döndürsün. `Math.random()` bu sözleşmeyi ilk çağrıda bozar. Bu yüzden serinin diğer yazılarındaki `mulberry32`'yi burada da kullanıyoruz:

```ts
// src/rng.ts
/** 32-bit tohumlu, hızlı ve deterministik üreteç. Aynı tohum → aynı dizi. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Şimdi gürültü. Kütüphane çekmiyoruz; seride "önce elle yaz" kuralı geçerli. Burada elle yazmanın somut bir karşılığı da var: permütasyon tablosunun tohumdan nasıl türediğini görmezseniz "aynı tohum aynı dünya" iddiası bir umut olarak kalır.

Value noise'un çekirdeği bir lattice (kafes). Tam sayı koordinatlara sabit değerler oturtuyoruz, aradaki noktaları interpolasyonla dolduruyoruz. Kafes değerlerine erişimi bir permütasyon tablosu üzerinden yapıyoruz ki tablo 256 elemanda kalsın ama koordinat uzayı sınırsız görünsün:

```ts
// src/noise.ts
import { mulberry32 } from "./rng.js";

/** Tohumdan Fisher-Yates ile karılmış 0..255 permütasyonu, 512'ye katlanmış hâli. */
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

/** Tohumlu 2B value noise. Dönüş aralığı [-1, 1]. */
export function makeValueNoise(seed: number): Noise2D {
  const perm = makePermutation(seed);
  const lattice = new Float32Array(256);
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  for (let i = 0; i < 256; i++) lattice[i] = rng() * 2 - 1;

  const at = (xi: number, zi: number) => lattice[perm[(perm[xi & 255] + (zi & 255)) & 255]];
  // Perlin'in quintic fade'i: birinci VE ikinci türevi uçlarda sıfır.
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
```

`fade` fonksiyonundaki `6t⁵ − 15t⁴ + 10t³` bir süs değil. Hücre sınırında hem birinci hem ikinci türevi sıfırlıyor. Daha basit olan `smoothstep` (`3t² − 2t³`) sadece birinci türevi sıfırlar; ikinci türevi süreksiz kalır. Normalleri yükseklik alanının türevinden hesaplayacağımız için bu fark doğrudan aydınlatmaya yansır: smoothstep'le her noise hücresinin sınırında zayıf bir çizgi belirmesi işten değil. Chunk dikişini kovalarken yanına bir de kafes dikişi eklemenin âlemi yok.

fBm katmanı bunun üstüne oturuyor. Her oktavda frekansı `lacunarity` ile çarpıp genliği `gain` ile azaltıyoruz, sonra toplam genliğe bölüp aralığı geri [-1, 1]'e sıkıştırıyoruz:

```ts
export interface FbmOptions {
  octaves: number;
  lacunarity: number;
  gain: number;
}

/** Oktav genliklerinin toplamı — normalizasyon böleni. gain=0.5, 5 oktav → 1.9375. */
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
```

`amplitudeSum`'ı ayrı bir fonksiyon olarak dışarı vermemin sebebi test edilebilirlik. 5 oktav ve 0,5 gain için değer tam olarak 1,9375 — `1 + 0.5 + 0.25 + 0.125 + 0.0625`. Bu bölme unutulduğunda arazi sessizce iki katına yakın yükselir ve `amplitude` parametresi anlamsızlaşır. Bir satırlık test, bir saatlik "neden bu tepeler bu kadar sivri" sorusunu önlüyor.

Yükseklik fonksiyonu artık tek satır:

```ts
// src/height-field.ts
import { makeFbm } from "./noise.js";
import { chunkSize } from "./chunk-grid.js";

export interface TerrainParams {
  seed: number;
  segments: number; // chunk kenarındaki quad sayısı
  cellSize: number; // bir quad'ın dünya birimi cinsinden kenarı
  amplitude: number; // tepe yüksekliği (dünya birimi)
  frequency: number; // dünya birimi → noise uzayı ölçeği
  octaves: number;
  lacunarity: number;
  gain: number;
}

export const DEFAULT_TERRAIN: TerrainParams = {
  seed: 1337,
  segments: 64,
  cellSize: 1,
  amplitude: 12,
  frequency: 1 / 96,
  octaves: 5,
  lacunarity: 2,
  gain: 0.5,
};

export type HeightFn = (worldX: number, worldZ: number) => number;

/** Dünya koordinatından yükseklik. Saf fonksiyon: aynı girdi → aynı çıktı, her yerde. */
export function makeHeightFn(p: TerrainParams): HeightFn {
  const fbm = makeFbm(p.seed, p);
  return (worldX, worldZ) => fbm(worldX * p.frequency, worldZ * p.frequency) * p.amplitude;
}
```

Şuna dikkat: `makeHeightFn`'in döndürdüğü `height` chunk'ı hiç bilmiyor. Sadece dünya koordinatı alıyor. A chunk'ının sağ kenarındaki vertex için `worldXOf(p, 0, 64)` = 64, B chunk'ının sol kenarındaki vertex için `worldXOf(p, 1, 0)` = 64. Aynı sayı. Aynı fonksiyon. Aynı float.

Yükseklik dikişi böylece sorun olmaktan çıkıyor. IEEE 754 aritmetiği deterministik: aynı girdilere aynı işlemleri uygularsanız aynı biti alırsınız. Kenar yüksekliklerinin farkı sıfıra yakın değil, sıfır.

Sorun bir üst katmanda başlıyor.

### Duvar Dibinde Büyüyen Vertex

Şimdi herkesin yaptığı şeyi yapalım. `PlaneGeometry` al, yatır, Y'leri doldur, normalleri hesaplat:

```ts
// src/chunk-mesh.ts (naif yol)
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
```

İki küçük not, çünkü ikisi de saatler yiyebiliyor. `PlaneGeometry` XY düzleminde ve +Z'ye bakıyor; zemin yapmak için `rotateX(-Math.PI / 2)` şart. Döndürdükten sonra vertex sırası şöyle oluyor: `j * span + i` indeksindeki vertex dünyada `x = -size/2 + i·cell`, `z = -size/2 + j·cell` konumunda. Satırlar +Z yönünde ilerliyor, sütunlar +X yönünde. Bu düzeni elle doğruladığınıza emin olun; `rotateX(+Math.PI / 2)` yazarsanız satır sırası ters döner ve arazi kendi aynasına dönüşür — kimse fark etmez, sadece dünyanız yanlış olur.

Peki `computeVertexNormals()` tam olarak ne yapıyor? Three.js'in kaynağında algoritma açık: index tamponunu üçgen üçgen geziyor, her üçgen için iki kenar vektörünün çapraz çarpımını (cross product) alıyor ve **normalize etmeden** üçgenin üç vertex'ine ekliyor. Sonda her vertex'i normalize ediyor. Çapraz çarpımın boyu üçgen alanının iki katı olduğu için sonuç alan ağırlıklı (area-weighted) bir ortalama oluyor. Büyük üçgen daha çok söz sahibi.

İşin can alıcı yeri: "her üçgen" derken *bu geometrinin* üçgenleri kastediliyor. Başka bir `BufferGeometry`'de duran üçgenlerin varlığından haberi yok.

Bir ızgarada bir vertex'e kaç üçgen değer, sayalım. İç bölgedeki bir vertex dört quad'ın köşesidir ve bizim üçgenleme düzenimizde altı üçgene dokunur. Kenardaki bir vertex'in bir taraftaki quad'ları yoktur; geriye üç üçgen kalır. Köşedeki vertex daha da kötü: köşegenin uçlarında duran iki köşe için sayı **bir**.

| Vertex konumu | Değen üçgen sayısı |
|---|---|
| İç bölge | 6 |
| Kenar (dört kenarın herhangi biri) | 3 |
| Köşegen ucundaki iki köşe | 1 |
| Diğer iki köşe | 2 |

Kenar vertex'i normalini altı üçgen yerine üç üçgenden alıyor — ve o üç üçgenin hepsi aynı tarafta. Duvar dibindeki ağaç. Normal, chunk'ın içine doğru eğiliyor.

Komşu chunk aynı dünya konumundaki kendi kopyası için aynı şeyi yapıyor, ama onun "içi" ters yönde. İki normal birbirinden uzaklaşıyor. Aradaki açı yeterince büyüdüğünde ekranda o çizgi beliriyor — en çok da specular (parlak) bir materyalde ve yandan gelen ışıkta.

Bu kırılmanın bir de sessiz yarısı var. İki chunk'ın anlaşmazlığı gözle görülür, tamam. Ama tek bir chunk'ın kendi kenar normali de yanlış: gerçek yüzeyin eğimini temsil etmiyor, tek taraflı bir ortalamayı temsil ediyor. Chunk'ı tek başına render etseniz bile o kenar yanlış aydınlanır. Sorun "iki chunk uyuşmuyor" değil; sorun "kenar vertex'i eksik bilgiyle karar veriyor". Uyuşmazlık sadece belirtisi.

### Açıyı Ölçerken acos'a Güvenme

İddiayı ölçüye çevirelim. İki normal arasındaki açı, klasik olarak nokta çarpımın arkkosinüsü:

```ts
const angle = Math.acos(ax * bx + ay * by + az * bz);
```

Bu formül dikişi ölçmek için kötü bir seçim. Sebebi kosinüs fonksiyonunun sıfıra yakın açılarda düz olması: `cos(0.001 rad)` ile `cos(0)` arasındaki fark 5·10⁻⁷. Nokta çarpımı float ile hesaplarsanız o farkı gürültünün altında kaybedersiniz, `acos` da kaybı büyütür.

Somut örnek: bir normali `Float32Array`'e yazıp aynı diziden iki kez okuyun, birebir aynı vektörü elde edersiniz. Nokta çarpımları 1 çıkmaz — float32'ye yuvarlanmış bir birim vektörün boyu tam 1 değildir. `(1/√3, 1/√3, 1/√3)` için ölçtüğüm değer 0,99999996410353731; `acos` bunu **0,015352 dereceye** çeviriyor. Birbirinin aynısı olan iki normal arasında sıfırdan farklı bir açı ölçmüş olursunuz. Ölçüm aracınızın gürültü tabanı, aradığınız sinyalin bir kısmını yutuyor.

Sayısal olarak kararlı hâli şu:

```ts
// src/seam.ts
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
```

Bu numarayı ilk gördüğümde biraz fazla zekice bulmuştum, sonra alıştım. Mantığı basit: iki birim vektörün farkının boyu `2·sin(θ/2)`, toplamının boyu `2·cos(θ/2)`. `atan2` ikisinin oranından açıyı çıkarıyor ve küçük açılarda pay küçüldüğü için hassasiyet artıyor — kaybolmuyor. Bonus: girdiler tam olarak birim uzunlukta olmasa bile makul davranıyor.

Dikiş raporu buradan çıkıyor. Kenar vertex indekslerini üretip iki tampon arasında dolaşıyoruz:

```ts
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
```

Tabloyu dolduracak araç artık elimizde. Projede `npm run seam` bu ölçümü tarayıcısız yapıyor — WebGL yok, GPU yok, saf aritmetik. Varsayılan arazide (`amplitude` 12, `frequency` 1/96), A(0,0) ile B(1,0) chunk'larının paylaştığı 65 vertex'lik kenarda:

| Yaklaşım | Dikişte maks. normal farkı | Ortalama | Dikişte yükseklik farkı |
|---|---|---|---|
| `computeVertexNormals()` (chunk başına) | 4,3980° | 2,1292° | 0 (birebir eşit) |
| Taşma halkası + `computeVertexNormals()` | 0 (tam) | 0 (tam) | 0 |
| Alandan merkezî fark | 0 (tam) | 0 (tam) | 0 |

Yükseklik sütununun sıfır olması bir ölçüm değil, bir sonuç: aynı saf fonksiyon, aynı girdiler.

Normal sütunundaki ilk satır ise bir ölçüm. Ortalama 2,13 derece — yani dikiş boyunca *tipik* vertex bile iki dereceyi aşan bir anlaşmazlık taşıyor, en kötüsü 4,4 dereceye çıkıyor. Parlak bir materyalde ve yandan gelen ışıkta bu fazlasıyla yeter. Dokuz chunk'ın on iki iç dikişini birden gezdirdiğimde en kötü değer 6,7131 dereceye çıkıyor; dik arazi ön ayarında (`amplitude` 24, `frequency` 1/48) aynı kenar çifti 24,3907 dereceye, o arazinin kuzey-güney dikişi ise 32,0232 dereceye kadar çıkıyor. Eğim arttıkça kırılma da artıyor, çünkü tek taraflı ortalamanın hatası eğimle büyüyor.

Alttaki iki satır sıfır. İkisinin neden sıfır olduğu aynı hikâye değil — sıradaki bölüm tam olarak bu.

### İki Çıkış Yolu — ve Üçüncüsü

Elimizde iki klasik seçenek var.

**Taşma halkası (skirt / overlap ring).** Chunk'ı her kenardan bir vertex daha geniş kuruyorsunuz. Chunk ızgarası `(N+1)×(N+1)` vertex olduğu için halkalı hâli `(N+3)×(N+3)` oluyor — dört yandan birer sütun/satır dışarı taşıyor. `computeVertexNormals()`'ı bu geniş ızgarada çağırıyorsunuz; artık asıl chunk'ın kenar vertex'lerinin her yanında üçgen var, altısı da orada. Sonra halkayı atıp iç `(N+1)×(N+1)` normalleri saklıyorsunuz. Ağacın etrafındaki duvarı yıkmak, sonra duvarı geri koymak.

Maliyeti hesaplanabilir: 65² = 4.225 yerine 67² = 4.489 vertex. Tam olarak %6,25 fazla örnekleme ve %6,35 fazla üçgen — hepsi çöpe gidiyor.

Bu yaklaşımın gerçek üstünlüğü şu: yükseklik kaynağının analitik olmasını gerektirmiyor. Yükseklikleriniz bir PNG heightmap'ten geliyorsa, ya da bir sanatçı Blender'da elle yontmuşsa, kapalı formda bir türev yoktur. Halka yöntemi orada da çalışır — tek şartı, kaynağı chunk sınırının bir hücre ötesinden örnekleyebilmek. Bu gerçek bir avantaj; hakkını vermek lazım.

Tablodaki sıfırı da hakkını vererek yazayım, çünkü beni şaşırtan yer orası oldu. Halkanın dikişi "yeterince iyi" kapatmasını bekliyordum, tam sıfır beklemiyordum. Ölçtükten sonra sebebini gördüm: A'nın doğu kenarındaki vertex halka ızgarasında iç bölgede kalıyor, altı komşu üçgeninin hepsi orada. B'nin batı kenarındaki kopyası için de aynı altı üçgen — aynı dünya koordinatlarından örneklenmiş, aynı float32'ye yuvarlanmış. Üstelik `computeVertexNormals()` index tamponunu quad sırasıyla gezdiği için çapraz çarpımların toplanma **sırası** bile iki chunk'ta birebir aynı. Aynı sayılar aynı sırayla toplanınca aynı bit çıkıyor. Yani halka yöntemi bu sahnede kusursuz; onu eleyecek olan dikiş değil, LOD.

**Analitik normal.** Yükseklik alanının kısmî türevlerini merkezî farkla (central difference) alıyorsunuz. Yüzey `y = h(x, z)` ise normal `(-∂h/∂x, 1, -∂h/∂z)` yönündedir, normalize edilir. Mesh'e hiç bakmıyorsunuz; alana soruyorsunuz.

Bu yolun üstünlüğü topolojiden tamamen bağımsız olması. Üçgenlemenin köşegeni hangi yöne bakıyor, komşu chunk aynı çözünürlükte mi, index sırası aynı mı — hiçbiri fark etmiyor. Aynı dünya koordinatı, aynı fonksiyon, aynı sonuç. Halka yönteminin az önceki sıfırı ise tam olarak bu bağımsızlığa sahip değil: sıfır çıkmasının sebebi iki chunk'ın *aynı topolojiyi* paylaşması. Komşu chunk yarı çözünürlükte olduğunda kenar vertex'inin gördüğü üçgenler artık aynı değil ve halkanın garantisi düşer. Bunu bu projede ölçmedim — LOD kapsam dışı — ama alan tabanlı normalin neden LOD'a dayanıklı olduğu buradan anlaşılıyor.

Maliyeti ise ilk bakışta ürkütücü: vertex başına dört ek yükseklik örneği. 4.225 vertex için 21.125 fbm çağrısı — halkanın 4.489'una karşı beş kata yakın.

İşte burada üçüncü yol devreye giriyor ve ikisinin de iyi yanını alıyor. Merkezî farkın ihtiyaç duyduğu komşu yükseklikler, halkanın zaten ürettiği yükseklikler. Chunk için **bir kez** `(N+3)×(N+3)` yükseklik tamponu doldurun, normalleri o tampondan okuyun:

```ts
// src/height-field.ts (devamı — chunkSize yukarıda zaten import edildi)
export interface HeightPatch {
  /** (segments + 3)² yükseklik. Yerel indeks aralığı -1 .. segments+1. */
  data: Float32Array;
  /** Satır uzunluğu = segments + 3. */
  span: number;
}

/** Chunk'ın yüksekliklerini BİR hücrelik taşma halkasıyla birlikte örnekler. */
export function sampleChunkHeights(
  p: TerrainParams,
  chunkX: number,
  chunkZ: number,
  height: HeightFn,
): HeightPatch {
  const span = p.segments + 3;
  const data = new Float32Array(span * span);
  const originX = chunkX * chunkSize(p);
  const originZ = chunkZ * chunkSize(p);

  for (let j = 0; j < span; j++) {
    const gz = j - 1; // -1 .. segments+1
    for (let i = 0; i < span; i++) {
      const gx = i - 1;
      data[j * span + i] = height(originX + gx * p.cellSize, originZ + gz * p.cellSize);
    }
  }
  return { data, span };
}

/** Yükseklik tamponundan merkezî farkla normal. Mesh'e hiç bakmaz. */
export function normalsFromHeights(p: TerrainParams, patch: HeightPatch): Float32Array {
  const { data, span } = patch;
  const n = p.segments + 1;
  const out = new Float32Array(n * n * 3);
  const twoCell = 2 * p.cellSize;

  for (let j = 0; j < n; j++) {
    const fj = j + 1; // halka ofseti
    for (let i = 0; i < n; i++) {
      const fi = i + 1;
      const dx = (data[fj * span + fi + 1] - data[fj * span + fi - 1]) / twoCell;
      const dz = (data[(fj + 1) * span + fi] - data[(fj - 1) * span + fi]) / twoCell;
      const len = Math.hypot(-dx, 1, -dz);
      const k = (j * n + i) * 3;
      out[k] = -dx / len;
      out[k + 1] = 1 / len;
      out[k + 2] = -dz / len;
    }
  }
  return out;
}
```

Toplam maliyet: 4.489 yükseklik örneği. Halkanınkiyle birebir aynı. Karşılığında topolojiden bağımsız, LOD'a dayanıklı ve dikişte **tam olarak** eşit normaller.

Neden tam olarak eşit? Çünkü A'nın sağ kenarındaki bir vertex için merkezî fark, dünya koordinatı `(64, z)` noktasının doğu ve batı komşularını kullanıyor: `(65, z)` ve `(63, z)`. B'nin sol kenarındaki aynı vertex için de kullandığı noktalar `(65, z)` ve `(63, z)`. İki chunk aynı yükseklik fonksiyonunu aynı koordinatlarda çağırıyor, aynı float32'ye yuvarlıyor, aynı bölmeyi yapıyor. Fark bit düzeyinde sıfır — "çok küçük" değil, sıfır.

`twoCell` bölenindeki `2 * cellSize` seçimi de bilinçli. Merkezî farkı sonsuz küçük bir adımla alsaydınız sürekli yüzeyin gerçek gradyanını bulurdunuz; ama render ettiğiniz şey sürekli yüzey değil, vertex'lerde örneklenmiş parçalı düzlemsel bir yaklaşım. Adımı hücre boyutuna eşitlemek, normali mesh'in gerçekten çizdiği yüzeye yaklaştırıyor.

Bunu ölçmek de mümkün, çünkü "mesh'in gerçekten çizdiği yüzeyin normali" elimizde: halka yönteminin ürettiği alan ağırlıklı ortalama tam olarak o. Alan tabanlı normali halka normaliyle karşılaştırıp ortalama açı farkına bakıyorum:

| Merkezî fark adımı | Halka normalinden ortalama sapma |
|---|---|
| `cellSize / 8` | 0,3630° |
| `cellSize / 2` | 0,2917° |
| **`cellSize`** (bizim seçimimiz) | **0,1124°** |
| `cellSize × 2` | 0,7046° |
| `cellSize × 4` | 2,2587° |

İki yönde de minimum tam olarak hücre boyutunda. Adımı küçültürseniz sürekli yüzeye yaklaşırsınız ama çizilen üçgenlerden uzaklaşırsınız; büyütürseniz normaller geniş bir alanın ortalamasına döner ve arazi olduğundan düz görünür — büyük adımda normallerin Y bileşeninin 1'e yaklaştığını ölçtüm. Böleni yanlış yazmak (`2 * cellSize` yerine `cellSize`) çok daha pahalı: gradyan iki katına çıkıyor ve sapma 8,4038 dereceye fırlıyor.

Geometriyi kurmak artık düz bir doldurma işi:

```ts
// src/chunk-mesh.ts (alan tabanlı yol)
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
```

Pozisyonları yerel tuttuğuma dikkat edin: chunk'ın dünyadaki yeri `mesh.position` ile veriliyor. Yükseklikler dünya koordinatından örnekleniyor ama X ve Z yerel kalıyor. Bunun iki faydası var. Birincisi float32 hassasiyeti: dünya merkezinden uzaklaştıkça mutlak koordinatlar büyür ve vertex pozisyonlarının çözünürlüğü düşer; yerel koordinatta bu hiç olmaz. İkincisi bounding sphere: her chunk'ın küresi kendi yerel uzayında hesaplanıyor, `Object3D` dönüşümü onu dünyaya taşıyor — frustum culling doğru çalışıyor.

Karar: bu projede alan tabanlı yolu kullanıyoruz. Ama halka yöntemini de kodda tutuyoruz, çünkü yükseklik kaynağınız bir görüntüyse tek seçenek o.

### Chunk Başına Bir Geometry mi, Tek Dev Geometry mi?

İkinci eksen. Dokuz chunk'ı dokuz ayrı `Mesh` olarak mı kuracağız, yoksa hepsini tek bir `BufferGeometry`'de birleştirip tek `Mesh` mi yapacağız?

Pazarlık net: draw call sayısı ↔ frustum culling granülaritesi.

Dokuz mesh, dokuz draw call demek. Buna karşılık dokuz ayrı bounding sphere demek — three.js her kareyi çizmeden önce her mesh'in küresini kamera frustum'uyla kesiştiriyor ve dışarıda kalanı hiç göndermiyor. Kamera arazinin bir köşesine bakıyorsa GPU'ya belki iki chunk'lık üçgen gidiyor.

Tek dev geometry, bir draw call. Ama bir tane de bounding sphere: bütün arazinin küresi. Kamera ekranın köşesinde tek bir tepe görüyor olsa bile 73.728 üçgenin tamamı vertex shader'a giriyor. Culling'in yapabileceği tek şey "hepsi görünür" ya da "hiçbiri görünür değil" demek.

Hangisi kazanır? Sahnenizin şekline bağlı. Kamera yukarıdan bütün araziyi görüyorsa culling eleyecek bir şey bulamaz ve tek geometry öne çıkar. Kamera zemine yakınsa ve görüş mesafesi kısaysa beklentim tersi: chunk'lı yol kazanır, arazi büyüdükçe culling'in eleyebildiği oran da artar.

Bu yüzden demo iki modu da kuruyor ve HUD'da üç gerçek sayacı gösteriyor: `renderer.info.render.calls`, `renderer.info.render.triangles` ve `renderer.info.memory.geometries`. Üçü de renderer'ın kendi sayaçları, biz uydurmuyoruz.

| Mod | Draw call | Çizilen üçgen | Geometry sayısı |
|---|---|---|---|
| 3×3 ayrı chunk, hepsi kadrajda | 9 | 73.728 | 9 |
| 3×3 ayrı chunk, biri kadraj dışında | **8** | **65.536** | 9 |
| Tek birleşik geometry | **1** | 73.728 | 10 |

Tabloyu demoda `M` tuşuyla ölçtüm; üç sayı da renderer'ın kendi sayaçlarından geliyor. Ortadaki satır işin özü: kamerayı biraz çevirdiğimde draw call 9'dan 8'e, çizilen üçgen 73.728'den 65.536'ya düştü. Aradaki fark tam olarak 8.192 — bir chunk'ın üçgen sayısı. Culling gerçekten çalışıyor ve tam bir chunk granülaritesinde eliyor.

Birleşik geometry satırında üçgen sayısının düşmediğine dikkat edin. Kamera nereye bakarsa baksın 73.728 üçgenin hepsi gidiyor, çünkü elenecek tek bir kürede toplanmışlar. Bir draw call kazandım, elemeyi kaybettim.

Geometry sayısının birleşik modda 9 değil **10** çıkması ise beni bir an durdurdu: birleştirilmiş geometry sahnede, ama dokuz chunk geometry'si de hâlâ bellekte duruyor — demo modlar arasında geçiş yapabilsin diye ikisini birden tutuyor. Gerçek bir oyunda bu bir sızıntı olurdu; burada bilinçli. Sayaç yalan söylemiyor, ben ona iki modu birden tutturuyorum.

Hangisinin kazandığı hâlâ sizin sahnenizin sorusu. Ama artık soruyu ölçerek soracak bir aletiniz var.

Bir uyarı: "tek dev geometry" yolunda index tamponunun tipine dikkat. 3×3 chunk'ın birleşiği 38.025 vertex ediyor, `Uint16Array`'in 65.535 sınırının altında. 5×5'e çıkarsanız 105.625 vertex olur ve `Uint32Array`'e geçmek zorunda kalırsınız — index tamponu bir anda iki katına çıkar. Chunk'lı yolda bu sınıra hiç yaklaşmazsınız, çünkü her chunk kendi indeks uzayında yaşıyor.

### Paylaşılan Index Buffer ve Sessiz Yeniden Yükleme

Chunk'lı yolun az bilinen bir kazancı var: topoloji her chunk'ta birebir aynı.

Değişen ne? Pozisyonlar ve normaller. Değişmeyen ne? Hangi vertex'in hangi üçgene girdiği. Izgara düzeni sabit olduğu sürece index tamponu dokuz chunk için tek bir tampondur.

```ts
// src/chunk-grid.ts (devamı)
/**
 * Izgara topolojisi. Chunk'lar arasında PAYLAŞILIR — pozisyon/normal değişir,
 * bu değişmez. Vertex sayısı 65.536'yı aşmıyorsa Uint16 yeter.
 */
export function buildIndices(segments: number): Uint16Array | Uint32Array {
  const span = segments + 1;
  const total = span * span;
  const out =
    total > 65_536
      ? new Uint32Array(segments * segments * 6)
      : new Uint16Array(segments * segments * 6);

  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * span + i;
      const b = a + 1;
      const c = a + span;
      const d = c + 1;
      out[k++] = a;
      out[k++] = c;
      out[k++] = b;
      out[k++] = b;
      out[k++] = c;
      out[k++] = d;
    }
  }
  return out;
}
```

Üçgenleme düzeni de bir tercih. Her quad'ın köşegenini `b–c` üzerinden geçiriyoruz: sol-alt ile sağ-üst arasından. Bütün quad'larda aynı yöne. Bu global tutarlılık, halka yöntemini kullanacak olanlar için kritik: iki komşu chunk aynı köşegen düzenini paylaşmazsa halka bile dikişi kapatmaz. Alan tabanlı normalde ise köşegenin yönü hiç önemli değil — o yolun rahatlığı tam olarak burada.

Peki paylaşmanın karşılığı ne? Three.js'te `WebGLAttributes` GPU tamponlarını bir `WeakMap` içinde tutuyor ve anahtar `BufferAttribute` nesnesinin **kendisi**. Aynı attribute'u dokuz geometriye verirseniz GPU'ya bir kez yükleniyor.

Sayısı şöyle: 24.576 index × 2 bayt = 49.152 bayt. Dokuz ayrı kopya 442.368 bayt ederdi; paylaşınca 49.152 bayt kalıyor. 393.216 baytlık fark, ve tek maliyeti aynı nesneyi dokuz `setIndex` çağrısına vermek.

Şimdi bu paylaşmanın ince tarafı. `three/src/renderers/webgl/WebGLGeometries.js` içindeki `onGeometryDispose` şöyle davranıyor:

```js
if ( geometry.index !== null ) {
  attributes.remove( geometry.index );
}
```

Yani bir chunk'ı `dispose()` ettiğinizde paylaşılan index tamponunun GPU kopyası siliniyor — diğer sekiz chunk hâlâ onu kullanıyor olsa bile. Çökme yok: bir sonraki karede `WebGLAttributes.update` tamponu `WeakMap`'te bulamıyor ve yeniden oluşturuyor. Ama o kare bir upload ödüyor ve bunu size kimse söylemiyor.

Serinin `dispose()` yazısındaki disiplin burada küçük bir istisna istiyor: chunk'ları teker teker `dispose()` etmek yerine bir "yıkım" adımında hepsini birlikte boşaltın. Paylaşılan kaynak, paylaşılan yaşam döngüsü demek.

Bunu kaynağı okuyarak buldum, tarayıcıda ölçerek değil. Kare süresine ne kadar yansıdığını ölçmedim; sadece davranışın böyle olduğunu biliyorum.

### Kanıt: GPU'suz, Deterministik Testler

Bu yazının iddialarının neredeyse tamamı saf aritmetik. WebGL yok, GPU yok, tarayıcı yok — vitest node altında koşuyor ve milisaniyeler alıyor.

Tohumun sözünü tutup tutmadığından başlayalım:

```ts
// tests/noise.test.ts (ilk beş test)
import { describe, expect, it } from "vitest";
import { amplitudeSum, makeFbm, makePermutation, makeValueNoise } from "../src/noise.js";
import { mulberry32 } from "../src/rng.js";
import { DEFAULT_TERRAIN, makeHeightFn } from "../src/height-field.js";

const FBM = { octaves: 5, lacunarity: 2, gain: 0.5 };

describe("tohumlu gürültü", () => {
  it("aynı tohum → bit bit aynı permütasyon", () => {
    expect(Array.from(makePermutation(1337))).toEqual(Array.from(makePermutation(1337)));
    expect(Array.from(makePermutation(1337))).not.toEqual(Array.from(makePermutation(1338)));
  });

  it("permütasyon 0..255'in gerçek bir permütasyonu ve 512'ye katlanmış", () => {
    const perm = makePermutation(1337);
    expect(perm.length).toBe(512);
    expect([...new Set(perm.slice(0, 256))].length).toBe(256);
    for (let i = 0; i < 256; i++) expect(perm[i + 256]).toBe(perm[i]);
  });

  it("oktav genlik toplamı: gain 0,5 ve 5 oktav → 1,9375", () => {
    expect(amplitudeSum(FBM)).toBe(1.9375);
    expect(amplitudeSum({ ...FBM, octaves: 1 })).toBe(1);
    expect(amplitudeSum({ ...FBM, gain: 1 })).toBe(5);
  });

  it("fBm normalize: 20.000 örnekte [-1, 1] dışına çıkmaz", () => {
    const fbm = makeFbm(1337, FBM);
    for (let i = 0; i < 20_000; i++) {
      const v = fbm((i % 211) * 0.37, Math.floor(i / 211) * 0.53);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("value noise kafes köşelerinde tekrar eder (256 periyot)", () => {
    const noise = makeValueNoise(1337);
    expect(noise(3, 7)).toBe(noise(3 + 256, 7 + 256));
  });
});
```

Dördüncü testteki 20.000 örnek, `amplitudeSum`'a bölmeyi unutan bir refactor'ü anında yakalar. Beşinci test ise permütasyon tablosunun 256'lık periyodunu belgeliyor — bu bir hata değil, bir sınır: dünyanız 256 noise hücresinden büyükse desen tekrar etmeye başlar. Bilerek yaşadığımız bir kısıt ve test onu görünür tutuyor.

Sıra ızgara aritmetiğinde:

```ts
// tests/chunk-grid.test.ts (ilk beş test)
import { describe, expect, it } from "vitest";
import {
  buildIndices,
  chunkSize,
  triangleCount,
  vertexCount,
  vertexSpan,
  worldXOf,
  worldZOf,
} from "../src/chunk-grid.js";
import { DEFAULT_TERRAIN } from "../src/height-field.js";

const P = DEFAULT_TERRAIN; // segments 64, cellSize 1

describe("chunk ızgara aritmetiği", () => {
  it("N quad → N+1 vertex, 2N² üçgen", () => {
    expect(vertexSpan(P)).toBe(65);
    expect(vertexCount(P)).toBe(4225);
    expect(triangleCount(P)).toBe(8192);
    expect(buildIndices(P.segments).length).toBe(24_576);
  });

  it("komşu chunk'lar kenar vertex'ini PAYLAŞIR", () => {
    // A'nın son sütunu ile B'nin ilk sütunu aynı dünya X'i
    expect(worldXOf(P, 0, P.segments)).toBe(worldXOf(P, 1, 0));
    expect(worldXOf(P, 0, P.segments)).toBe(64);
    expect(chunkSize(P)).toBe(64);
  });

  it("off-by-one: kökeni vertexSpan ile çarpmak bir hücre boşluk açar", () => {
    const wrong = (cx: number, i: number) => cx * vertexSpan(P) * P.cellSize + i * P.cellSize;
    expect(wrong(0, P.segments)).toBe(64);
    expect(wrong(1, 0)).toBe(65); // ← 1 hücrelik yarık
    expect(wrong(1, 0) - wrong(0, P.segments)).toBe(P.cellSize);
  });

  it("index tamponu vertex sayısını aşmaz ve her üçgeni bir kez üretir", () => {
    const idx = buildIndices(P.segments);
    expect(idx.BYTES_PER_ELEMENT).toBe(2); // 4225 vertex → Uint16 yeter
    let max = 0;
    for (const v of idx) if (v > max) max = v;
    expect(max).toBe(vertexCount(P) - 1);
    expect(idx.length / 3).toBe(triangleCount(P));
  });

  it("büyük chunk Uint32'ye geçer", () => {
    expect(buildIndices(256).BYTES_PER_ELEMENT).toBe(4); // 257² = 66.049
    expect(buildIndices(255).BYTES_PER_ELEMENT).toBe(2); // 256² = 65.536
  });
});
```

Üçüncü test benim en sevdiğim, çünkü hatayı değil hatanın *büyüklüğünü* çiviliyor: yanlış çarpan tam olarak bir `cellSize` kaydırıyor. Bu tarz testler bir gün birinin "acaba bir yarım hücre mi kaydı" diye saatlerce bakmasını engelliyor.

Şimdi asıl mesele — dikiş:

```ts
// tests/seam.test.ts (ilk altı test)
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
});
```

Üçüncü testteki `toBe(0)` üzerinde bir saniye durmak istiyorum. Float karşılaştırmasında tam eşitlik iddia etmek genelde kötü bir alışkanlık; burada ise iddianın kendisi bu. İki chunk aynı fonksiyonu aynı girdilerle çağırıyorsa `toBeCloseTo` yazmak, sözleşmeyi zayıflatmak olur. Testi bilerek katı yazıyoruz: bir gün biri normalleri chunk'a göre kaydıran bir "optimizasyon" eklerse test kırmızıya dönsün.

İkinci testteki `nonZero` sayacı da bir kendini kandırma panzehiri. `expect(av).toBe(bv)` iki dizi de baştan sona sıfırsa da geçer — yani yükseklik fonksiyonunu bozup her yerde 0 döndürseniz test yeşil kalır. Sayaç, karşılaştırdığımız 65 değerin gerçekten arazi taşıdığını iddiaya ekliyor.

Dördüncü test ters yönde çalışıyor: naif yolun kırıldığını **kanıtlıyor**. Bir hatayı düzelttiğinizi iddia ediyorsanız, hatanın var olduğunu da göstermeniz gerekiyor. Yoksa düzeltmenin bir şey yaptığını nereden bileceğiz? İki yolu aynı testin içinde, aynı dikişte, aynı arazide karşılaştırmamın sebebi bu: `field.maxDegrees` tam 0, `mesh.maxDegrees` biriden büyük. Son satır ise kırılmanın *yerini* çiviliyor — chunk'ın ortasındaki vertex'te iki yol neredeyse aynı sonucu veriyor, kavga sadece kenarda. Testin dik bir arazi ön ayarı (`STEEP`) kullanmasının sebebi de eşiğin kırılgan olmaması: yumuşak arazide fark küçük kalıyor.

Bir de topolojiyi doğrulayan küçük bir paket var — vertex'e değen üçgen sayıları:

```ts
// tests/chunk-mesh.test.ts (ilgili kısım)
  it("iç vertex 6, kenar vertex 3, köşegen ucundaki köşe 1 üçgene değer", () => {
    const span = vertexSpan(P);
    const counts = new Uint8Array(span * span);
    for (const v of buildIndices(P.segments)) counts[v]++;

    const mid = Math.floor(span / 2);
    expect(counts[mid * span + mid]).toBe(6); // iç
    expect(counts[mid * span + (span - 1)]).toBe(3); // doğu kenarı
    expect(counts[0]).toBe(1); // köşegen ucu
    expect(counts[span * span - 1]).toBe(1); // öbür uç
    expect(counts[span - 1]).toBe(2);
  });

  it("paylaşılan index attribute dokuz geometride TEK nesne", () => {
    const height = makeHeightFn(P);
    const shared = new THREE.BufferAttribute(buildIndices(P.segments), 1);
    const chunks: THREE.BufferGeometry[] = [];
    for (let z = 0; z < 3; z++)
      for (let x = 0; x < 3; x++) chunks.push(buildFieldChunk(P, x, z, height, shared));

    expect(chunks).toHaveLength(9);
    for (const g of chunks) expect(g.index).toBe(shared); // aynı NESNE
    expect(new Set(chunks.map((g) => g.attributes.position)).size).toBe(9);
    for (const g of chunks) g.dispose();
  });
```

İkinci testteki son satır önemli: index paylaşılıyor ama pozisyonlar paylaşılmıyor. `Set`'in boyutu dokuz çıkmazsa bir yerde yanlışlıkla aynı tamponu tekrar kullanmışız demektir — ki o zaman dokuz chunk üst üste biner ve ekranda tek bir tepe görürsünüz.

### Demo: Üç Tuş, Bir Dikiş

Tarayıcı tarafını bilerek küçük tuttum. 3×3 chunk, kenar başına 64 segment, toplam 73.728 üçgen. Otomatik süpürme yok, sonsuz ölçüm döngüsü yok, post-process yok. Ölçüm elle tetikleniyor.

Üç tuş var:

- `N` — normal kaynağını değiştirir: alandan hesaplanan normaller ↔ chunk başına `computeVertexNormals()`. Dikişin belirip kaybolduğu an burası.
- `G` — geometri modunu değiştirir: 3×3 ayrı chunk ↔ tek birleşik geometry.
- `M` — ölçümü tetikler: `renderer.info` sayaçlarını okur, dikiş raporunu hesaplar ve HUD'a yazar.

HUD iki tür hücreyi ayrı etiketliyor. Serinin bir denetiminde sabit bir "DRAW CALLS" değerinin gerçek sayaç sanılması yakalanmıştı; o günden beri kural şu: `renderer.info`'dan ya da bir hesaptan gerçekten okunan değerler **ÖLÇÜM**, koddaki sabitlerden gelen değerler **YAPISAL**. Vertex ve üçgen sayıları yapısal (ızgara aritmetiğinden çıkıyor), draw call ve dikiş açısı ölçüm.

Işığı yandan ve alçaktan koyduk, materyal hafifçe parlak. Dikişi görmenin en kolay yolu bu; tepeden gelen dağınık bir ışıkta birkaç derecelik bir normal farkı kolayca gözden kaçar.

Bir de küçük bir Türkçe tuzağı, çünkü bunu yedim. HUD etiketlerinde `text-transform: uppercase` kullanıyorsanız ve sayfa `lang="tr"` ise tarayıcı Türkçe büyütme kuralını uygular: `i` harfi `İ` olur. `VERTICES` yazan etiket ekranda `VERTİCES` diye görünür. Çözüm basit — İngilizce etiketleri kaynakta zaten büyük harfle yazın, CSS'e büyütme yaptırmayın.

Demoyu `npm run dev` ile açın. `file://` ile açarsanız modüller yüklenmez ve siyah ekran görürsünüz; bunu seride her yazıda tekrar ediyorum çünkü hâlâ ara ara yiyorum.

### Bu Yazının Kapsamadıkları

Bir şeyi doğru yapmak için üç şeyi dışarıda bırakmak gerekti. Açıkça yazayım ki beklenti doğru kurulsun.

**LOD ve quadtree geçişleri yok.** Uzaktaki chunk'ları düşük çözünürlükte üretmek bu yazının bir sonraki adımı. Orada yeni bir dikiş türü çıkıyor: iki farklı çözünürlükteki chunk arasında pozisyon süreksizliği (T-junction). Normal tarafı zaten çözülmüş oluyor — alan tabanlı normalin çözünürlükten bağımsız olması tam olarak bu yüzden değerli.

**Worker'a taşıma yok.** Chunk üretimi ana thread'de koşuyor. 3×3 için sorun değil; görüş mesafesi büyüyünce chunk üretimini bir worker havuzuna almak gerekir ve `Float32Array`'leri transferable olarak geçirmek işin kolay tarafı.

**Çim, ağaç, taş serpme yok.** Yüzeye nesne yerleştirmek ayrı bir konu ve doğru yapılışı instancing üzerinden geçiyor. Serinin instancing yazısı o zemini kuruyor.

Bu yazının tek bir işi var: chunk'lı bir arazide dikişin neden kırıldığını göstermek ve kapatmak.

### Özetle:

1. Arazi tek bir yükseklik alanıdır; chunk o alana açılmış bir penceredir. Yüksekliği dünya koordinatından alan saf bir fonksiyon yazarsanız chunk sınırındaki yükseklik uyumu bedava gelir — hem de yaklaşık olarak değil, bit düzeyinde.
2. `N` segmentli bir chunk'ın kenarında `N+1` vertex vardır ve komşu chunk kenar vertex'ini **paylaşır**. Chunk kökeni `segments × cellSize` adımlarla ilerler; `(segments+1) × cellSize` yazmak chunk'lar arasında tam bir hücrelik yarık açar.
3. `computeVertexNormals()` normalleri *o geometrinin* üçgenlerinden hesaplar. İç vertex 6 üçgen görür, kenar vertex'i 3, köşegen ucundaki köşe 1. Kenar normali tek taraflı bir ortalamadır ve içeri doğru eğilir; komşu chunk ters yöne eğilir, ekranda ışık kırılır.
4. Bu bir bug değil, tanımın sonucu. Mesh komşu mesh'i tanımıyor; tanıması da beklenmiyor.
5. Açıyı `acos(a·b)` ile ölçmeyin. Float32 normallerde birebir aynı iki vektör bile 0,015352 derecelik sahte fark üretir (ölçtüm). `2·atan2(|a−b|, |a+b|)` sıfıra yakın açılarda kararlıdır ve aynı vektörde tam 0 döner.
6. Taşma halkası (skirt) yöntemi `(N+3)²` ızgara kurup normalleri orada hesaplar, halkayı atar — `N` segmentli bir chunk'ın kendi ızgarası `(N+1)²` olduğu için halkalı hâli iki sıra daha geniştir. 64 segmentte 67² = 4.489'a karşı 65² = 4.225, yani %6,25 fazla örnekleme. Ölçtüm: bu yöntem de dikişte tam 0 veriyor. Yükseklik kaynağı bir görüntü ya da elle yontulmuş bir mesh ise **tek** seçenek budur.
7. Alan tabanlı normal, yükseklik alanının merkezî farkını alır: `(-∂h/∂x, 1, -∂h/∂z)`. Üçgenlemeden, index sırasından ve çözünürlükten bağımsızdır; bu yüzden LOD eklendiğinde ayakta kalan tek yöntemdir.
8. İkisini birleştirin: chunk için bir kez `(N+3)²` yükseklik tamponu doldurun, merkezî farkı o tampondan alın. Halkanın maliyetiyle analitiğin garantisini aynı anda alırsınız — vertex başına dört ek fbm çağrısı yerine toplam %6,25 fazla örnekleme.
9. Merkezî fark adımını hücre boyutuna eşitleyin. Ölçtüm: mesh'in kendi normalinden ortalama sapma `cellSize`'da 0,1124°, yarısında 0,2917°, iki katında 0,7046° — iki yönde de minimum tam olarak hücre boyutunda. Böleni `2 × cellSize` yerine `cellSize` yazmak sapmayı 8,4038 dereceye çıkarıyor.
10. Chunk başına bir geometry draw call'u artırır ama frustum culling'i vertex düzeyinden chunk düzeyine indirir. Tek dev geometry tek draw call'dur ama tek bounding sphere'dir: kamera bir köşeye baksa bile bütün üçgenler vertex shader'a girer. Cevap sahnenizin şekline bağlı — `renderer.info.render.calls` ve `.triangles` ile ölçün.
11. Topoloji her chunk'ta aynı olduğu için index tamponu paylaşılabilir. 64 segmentte 24.576 index × 2 bayt = 49.152 bayt; dokuz chunk'ta 442.368 yerine 49.152 bayt. Three.js GPU tamponlarını attribute nesnesine göre önbelleklediği için bu paylaşım gerçekten tek bir GPU buffer'a düşüyor.
12. Ama paylaşılan attribute'un paylaşılan bir yaşam döngüsü vardır: tek bir chunk'a `dispose()` demek `onGeometryDispose` üzerinden ortak index tamponunun GPU kopyasını siler ve kalan chunk'lar bir sonraki karede sessizce yeniden yükler. Chunk'ları teker teker değil, toplu boşaltın.

Kodun tamamı — tohumlu noise, fBm, chunk ızgara aritmetiği, alan tabanlı normal, dikiş ölçer ve testler — GitHub'da. `npm test` beş dosyada 43 testle dikiş iddialarını tarayıcısız çiviliyor, `npm run seam` bu yazıdaki bütün derece değerlerini yeniden üretiyor, `npm run dev` de üç tuşla kontrol edilen hafif bir demoyu açıyor.

Bu yazıyı yazarken beni asıl durduran şey çözümün ne kadar küçük olduğuydu. `computeVertexNormals()` çağrısını silip yerine on beş satırlık bir merkezî fark döngüsü koymak. Yıllarca "chunk'lı arazide dikiş problemi" diye anlatılan şeyin tedavisi bu kadar. Zor olan kısım kodu yazmak değildi, sorunun mesh'te değil soruyu sorduğum yerde olduğunu anlamaktı. Mesh'e komşusunu sormak, bir pencereye manzarayı sormaya benziyor — cevap verir, hem de gayet ikna edici biçimde. Sadece gördüğü kadarını anlatır. ⚙️🧠
