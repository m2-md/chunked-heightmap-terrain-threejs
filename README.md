# Arazi Bölünür, Işık Bölünmez — Chunk'lı Heightmap Arazide Dikiş

"Arazi Bölünür, Işık Bölünmez: Chunk'lı Heightmap Arazide Normali Mesh'ten Değil Alandan
Hesaplamak" makalesinin çalışan kodu. Üç şey içerir:

1. **Render'dan ayrık çekirdek** (`src/rng.ts` · `noise.ts` · `height-field.ts` ·
   `chunk-grid.ts` · `seam.ts`) — tohumlu value noise + fBm, chunk ızgara aritmetiği,
   taşma halkalı yükseklik tamponu, alandan merkezî farkla normal, dikiş ölçer.
   Bağımlılık yok, WebGL yok, `Math.random()` yok.
2. **Üç normal yolu** (`src/chunk-mesh.ts`) — naif `computeVertexNormals()`, taşma
   halkası (skirt), alandan merkezî fark. Üçü de aynı dikişte ölçülüyor.
3. **Hafif demo** (`index.html` + `src/main.ts`) — 3×3 chunk, 64 segment, üç tuş.
   Otomatik süpürme yok, post-process yok, gölge yok.

## Sürümler

| Paket | Sürüm |
|---|---|
| `three` (+ `@types/three`) | 0.185.1 (r185) |
| TypeScript | 5.9 (strict) |
| Vite | 6 |
| Vitest | 2.1 |

Paket yöneticisi **npm** (ADR-001). Gürültü kütüphanesi ÇEKİLMEZ — noise elle yazılı.

## Kurulum

```bash
npm install
```

## Test

```bash
npm test
```

**43 test yeşil** olmalı (5 dosya, ~0,7 s). Hiçbiri tarayıcı, canvas ya da GPU istemez.

| Dosya | Test | Ne kanıtlıyor |
|---|---|---|
| `tests/noise.test.ts` | 9 | aynı tohum → bit bit aynı permütasyon **ve** bit bit aynı yükseklik dizisi (`Float64Array` ham baytları); farklı tohum → farklı · permütasyon gerçekten 0..255'in permütasyonu ve 512'ye katlanmış · oktav genlik toplamı `1.9375` (ve 2/3/4 oktav, `lacunarity` bağımsızlığı) · fBm 20.000 örnekte `[-1,1]` dışına çıkmıyor · bölen kaldırılınca ham toplamın 1'i AŞTIĞI (yani bölenin iş yaptığı) · kafes periyodu 256 |
| `tests/chunk-grid.test.ts` | 8 | N quad → N+1 vertex, 2N² üçgen · **N×N vertex → 2(N−1)² üçgen** (5 boyutta) · komşu chunk kenar vertex'ini paylaşıyor · **chunk indeksi ↔ dünya koordinatı** gidiş-dönüş (negatif indeks + `cellSize ≠ 1` dâhil) · off-by-one hatasının BÜYÜKLÜĞÜ tam bir `cellSize` · index sınırı/tipi (255 → 2 bayt, 256 → 4 bayt) · üçgenleme köşegeni her quad'da aynı yönde |
| `tests/seam.test.ts` | 11 | acos gürültü tabanı vs `2·atan2` · **dikişte yükseklik `toBe` (yaklaşık değil)** + karşılaştırılan 65 değerin gerçekten arazi taşıdığı · **dikişte normaller bileşen bazında eşit** (`toBe`, hem x hem y hem z) · **naif `computeVertexNormals()` AYNI dikişte kırıyor** (iki yol tek testte, yan yana) · taşma halkası da 0 veriyor ama alan yoluyla aynı sayıyı vermiyor · kuzey-güney dikişi · yanlış kenar çifti 0 vermiyor |
| `tests/chunk-mesh.test.ts` | 7 | değen üçgen sayıları (iç 6 · kenar 3 · köşegen ucu 1) · paylaşılan index TEK nesne, pozisyonlar 9 ayrı · attribute şekilleri + birim normaller · yükseklikler iki kez örneklenmiyor · `PlaneGeometry` + `rotateX(-90°)` satır sırası · **merkezî fark adımı = `cellSize` mesh'e en yakın normali veriyor** (dört alternatife karşı) |
| `tests/terrain.test.ts` | 8 | 3×3'te 12 iç dikiş · dokuz chunk + paylaşılan index · **12 dikişin hepsinde FIELD 0, MESH kırık** · `setNormalSource` pozisyonlara dokunmuyor · `mergeChunks` 38.025 vertex / 73.728 üçgen / `Uint32` index / dünya ofseti · birleşik geometry TEK bounding sphere · `disposeAll` toplu · kodda `Math.random` yok |

### Testler koruyucu mu? — mutasyon turu

Her iddia bozularak sınandı ("iddiayı boz → kızarmalı → geri al"). **15 mutasyonun
15'i yakalandı.** Denenenler:

| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | `worldXOf` kökeni `chunkSize + cellSize` adımlarla ilerlesin (off-by-one) | 3 test kırmızı |
| M2 | Halka tamponu DÜNYA yerine YEREL koordinattan örneklensin | 10 test kırmızı |
| M3 | Halka genişliği `segments + 3` yerine `segments + 2` | 7 test kırmızı |
| M4 | `angleBetweenDegrees` `2·atan2` yerine `acos(dot)` | 7 test kırmızı |
| M5 | Index tipi sınırı `> 65_536` yerine `>= 65_536` | 1 test kırmızı |
| M6 | `makeFbm` normalizasyon böleni kaldırılsın | 1 test kırmızı |
| M7 | `amplitudeSum` `gain`i yok saysın | 2 test kırmızı |
| M8 | `PlaneGeometry` `rotateX(+90°)` ile döndürülsün | 2 test kırmızı |
| M9 | `mergeChunks` index'e chunk ofseti eklemesin | 1 test kırmızı |
| M10 | Her chunk kendi index tamponunu kursun (paylaşım yok) | 2 test kırmızı |
| M11 | Üçgen köşegeni quad'a göre değişsin (global tutarlılık bozulsun) | 2 test kırmızı |
| M12 | Normaller normalize edilmesin | 2 test kırmızı |
| M13 | Merkezî fark böleni `2 * cellSize` yerine `cellSize` | 1 test kırmızı |
| M14 | `buildFieldChunk` yüksekliği halka ofseti olmadan okusun | 1 test kırmızı |
| M15 | `mergeChunks` bounding sphere hesaplamasın | 1 test kırmızı |

M13 ilk turda **yeşil kaldı** — makalenin "adımı hücre boyutuna eşitleyin" iddiasının
koruyucusu yoktu. `tests/chunk-mesh.test.ts` içindeki adım süpürme testi bunun için
yazıldı; ondan sonra 15/15.

## Ölçüm (tarayıcısız)

```bash
npm run seam
```

Makaledeki **bütün derece değerleri** bu komuttan çıkıyor. Ölçüm saf aritmetik:
WebGL, GPU, canvas yok.

```
### Izgara aritmetiği (yapısal — ölçüm değil)
  chunk vertex ızgarası  (N+1)² = 65² = 4225
  halka ızgarası         (N+3)² = 67² = 4489
  fazla örnekleme        %6.25
  fazla üçgen            %6.35
  9 chunk saklanan vtx   38025 · dünyada farklı konum 37249 (193²) · çakışan 776
  paylaşılan index       49152 B · paylaşılmasa 442368 B

### acos gürültü tabanı (birebir aynı float32 birim vektör)
  dot = 0.99999996410353731 · acos(dot) = 0.015352° · 2·atan2(...) = 0°

### Varsayılan arazi (segments 64, amplitude 12, frequency 1/96)
| computeVertexNormals() (chunk başına) | 4.3980° | ort. 2.1292° | yükseklik 0 |
| Taşma halkası + computeVertexNormals() | 0 (tam) | 0 (tam)      | 0 |
| Alandan merkezî fark                   | 0 (tam) | 0 (tam)      | 0 |

### Dik arazi (STEEP — amplitude 24, frequency 1/48)
| computeVertexNormals() | 32.0232° | ort. 10.2652° | 0 |

### Merkezî fark adımı süpürmesi (ölçüt: halka = mesh'in kendi normali)
| cellSize / 8 | 0.3630° |   | cellSize × 2 | 0.7046° |
| cellSize / 2 | 0.2917° |   | cellSize × 4 | 2.2587° |
| cellSize     | 0.1124° | ← minimum burada
| yanlış bölen (cellSize) | 8.4038° |

### 3×3 ızgaranın BÜTÜN iç dikişleri (12 dikiş)
  field → 0 (tam) · ring → 0 (tam) · mesh → 6.7131°
```

Hangi sayı hangi komuttan:

| Sayı | Komut |
|---|---|
| Dikiş tablosundaki bütün dereceler (4.3980 · 2.1292 · 32.0232 · 6.7131 · 0) | `npm run seam` |
| acos gürültü tabanı (`0.99999996410353731` → `0.015352°`) | `npm run seam` (ayrıca `tests/seam.test.ts`) |
| Merkezî fark adımı tablosu (0.3630 · 0.2917 · 0.1124 · 0.7046 · 2.2587 · 8.4038) | `npm run seam` (ayrıca `tests/chunk-mesh.test.ts`) |
| Izgara sayıları (4225 · 8192 · 24576 · 38025 · 37249 · 776 · 73728 · 49152 · %6,25 · %6,35) | `npm run seam` + `npm test` — yapısal, ölçüm değil |
| fBm genlik toplamı `1.9375` | `npm test` |
| Test sayısı 43 | `npm test` |

**`npm run seam` ile ölçülemeyen:** draw call · çizilen üçgen · geometry sayısı.
Bunlar `renderer.info` istiyor, yani gerçek bir WebGL bağlamı. Bu üç sayı demoda
`M` tuşuyla tarayıcıda ölçüldü ve makaledeki tabloya öyle yazıldı — 3×3 ayrı chunk
hepsi kadrajda `9 / 73.728 / 9`, biri kadraj dışında `8 / 65.536 / 9`, tek birleşik
geometry `1 / 73.728 / 10` (geometry 10, çünkü demo iki modu birden tutuyor).
Kendi makinende `npm run dev` + `M` ile tekrarlayabilirsin. Tahmin yazılmadı.

## Demo (hafif)

```bash
npm run dev        # → http://localhost:5216/
```

> **`file://` ile AÇMA.** `index.html`'i çift tıklarsan ES modülleri çözülmez ve
> siyah ekran görürsün. Vite dev sunucusu şart.

Demo bilerek hafif: 3×3 chunk, kenar başına 64 segment, toplam 73.728 üçgen. Gölge
yok, post-process yok, otomatik süpürme yok. Ölçümü **sen** tetikliyorsun.

| Tuş | İş |
|---|---|
| `N` | Normal kaynağı: **FIELD** (alandan merkezî fark) ↔ **MESH** (`computeVertexNormals`). Pozisyonlar değişmez — fark yalnızca aydınlatmada. |
| `G` | Geometri modu: **CHUNKED** (3×3 ayrı mesh) ↔ **MERGED** (tek birleşik geometry) |
| `M` | Ölçüm: `renderer.info` sayaçlarını oku + dikiş raporunu hesapla + HUD'a yaz |

HUD'daki her hücre etiketli, çünkü ikisini karıştırmak en kolay kendini kandırma yolu:

- `ÖLÇÜM` → o karede gerçekten okunan/hesaplanan: `renderer.info.render.calls`,
  `.triangles`, `renderer.info.memory.geometries`, canlı normal tamponlarından
  hesaplanan `SEAM MAX` ve `SEAM HEIGHT`.
- `YAPISAL` → koddaki ızgara aritmetiğinden: chunk sayısı, chunk başına vertex/üçgen,
  paylaşılan index tamponunun bayt boyu.

`M` ölçümü bir `renderer.render()` çağrısından **sonra** alınıyor; `info.render` her
`render()` başında sıfırlandığı için önce okursanız bir kare geriden gelir.

## Derleme

```bash
npm run build      # tsc && vite build
npm run preview
```

## Dosya yapısı

```
src/
  rng.ts           # mulberry32 — tohumlu üreteç
  noise.ts         # makePermutation · makeValueNoise (quintic fade) · amplitudeSum · makeFbm
  height-field.ts  # TerrainParams · makeHeightFn · sampleChunkHeights ((N+3)² halka)
                   # · normalsFromHeights (merkezî fark)
  chunk-grid.ts    # chunkSize · vertexSpan/Count · triangleCount · worldXOf/ZOf · buildIndices
  chunk-mesh.ts    # buildNaiveChunk(+Normals) · buildRingChunkNormals · buildFieldChunk
  seam.ts          # angleBetweenDegrees (2·atan2) · edgeIndices · compareNormalSeam
                   # · compareHeightSeam
  terrain.ts       # Terrain: 3×3 kurulum, paylaşılan index, mergeChunks, seamReport, disposeAll
  measure-seam.ts  # npm run seam — makaledeki bütün derece değerlerini üretir
  main.ts          # demo: renderer, sahne, HUD, N/G/M
tests/             # 5 dosya, 43 test — hiçbiri tarayıcı açmaz
```

## Kayda değer üç ayrıntı

1. **Halka yöntemi de dikişte tam 0 veriyor.** Bunu ölçmeden önce "yeterince iyi"
   bekliyordum. Sebebi: kenar vertex'i halka ızgarasında iç bölgede kalıyor, altı komşu
   üçgeni de orada; `computeVertexNormals()` index tamponunu quad sırasıyla gezdiği için
   iki chunk'ta toplama sırası bile birebir aynı oluyor. Halkayı eleyen dikiş değil, LOD.
2. **`compareNormalSeam` içindeki `RangeError` dalı ulaşılamaz.** Fonksiyon iki kenarı da
   aynı `span` ile üretiyor, dolayısıyla uzunluklar hep eşit. Makaledeki kodla birebir
   kalsın diye duruyor; onu test etmeye çalışan bir test yazılmadı (yazılsaydı totoloji
   olurdu).
3. **`lang="tr"` + `text-transform: uppercase` tuzağı.** HUD'un İngilizce etiketleri
   kaynakta zaten büyük harfle yazılı ve CSS'te `text-transform` YOK. Olsaydı tarayıcı
   Türkçe büyütme kuralını uygulayıp `VERTICES` yerine `VERTİCES` gösterirdi.

## Lisans

MIT — `LICENSE`.
