import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { chunkSize, triangleCount, vertexCount } from "./chunk-grid.js";
import { DEFAULT_TERRAIN } from "./height-field.js";
import { CHUNKS_X, CHUNKS_Z, Terrain, type GeometryMode, type NormalSource } from "./terrain.js";

const P = DEFAULT_TERRAIN;
const SIZE = chunkSize(P);
const WORLD = SIZE * CHUNKS_X;

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = false; // gölge yok — demo bilerek hafif

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080a11);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 2000);
camera.position.set(WORLD * 0.55, 46, WORLD * 1.05);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(WORLD / 2, 4, WORLD / 2);
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// Işık yandan ve alçaktan: dikişi görmenin en kolay yolu bu.
const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.position.set(-1, 0.32, 0.55).normalize().multiplyScalar(200);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x22d3ee, 0x0a0d16, 0.35));

const terrain = new Terrain(P);
terrain.group.position.set(0, 0, 0);
scene.add(terrain.group);

// ---------------------------------------------------------------- HUD

const el = (id: string) => document.getElementById(id) as HTMLElement;
const out = {
  mode: el("v-mode"),
  calls: el("v-calls"),
  tris: el("v-tris"),
  geoms: el("v-geoms"),
  seam: el("v-seam"),
  seamH: el("v-seamh"),
  chunks: el("v-chunks"),
  vpc: el("v-vpc"),
  tpc: el("v-tpc"),
  idx: el("v-idx"),
  stamp: el("v-stamp"),
};

let normalSource: NormalSource = "field";
let geometryMode: GeometryMode = "chunked";

const nf = new Intl.NumberFormat("tr-TR");

function paintMode(): void {
  const n = normalSource === "field" ? "FIELD" : "MESH";
  const g = geometryMode === "chunked" ? "CHUNKED" : "MERGED";
  out.mode.textContent = `${n} · ${g}`;
  out.mode.className = normalSource === "field" ? "value ok" : "value warn";
}

function paintStructural(): void {
  out.chunks.textContent = `${CHUNKS_X}×${CHUNKS_Z} = ${CHUNKS_X * CHUNKS_Z}`;
  out.vpc.textContent = nf.format(vertexCount(P));
  out.tpc.textContent = nf.format(triangleCount(P));
  const idxBytes = (terrain.sharedIndex.array as Uint16Array).byteLength;
  out.idx.textContent = `${nf.format(idxBytes)} B`;
}

/** ÖLÇÜM: renderer.info render'dan SONRA okunur, yoksa bir kare geriden gelir. */
function measure(): void {
  renderer.render(scene, camera);
  const info = renderer.info;
  out.calls.textContent = String(info.render.calls);
  out.tris.textContent = nf.format(info.render.triangles);
  out.geoms.textContent = String(info.memory.geometries);

  const report = terrain.seamReport(normalSource);
  out.seam.textContent = `${report.maxDegrees.toFixed(4)}° (${report.seams} dikiş)`;
  out.seam.className = report.maxDegrees === 0 ? "value ok" : "value warn";
  out.seamH.textContent = report.maxHeight === 0 ? "0 (tam)" : report.maxHeight.toExponential(3);
  out.stamp.textContent = new Date().toLocaleTimeString("tr-TR");
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "n") {
    normalSource = normalSource === "field" ? "mesh" : "field";
    terrain.setNormalSource(normalSource);
    paintMode();
  } else if (key === "g") {
    geometryMode = geometryMode === "chunked" ? "merged" : "chunked";
    terrain.setGeometryMode(geometryMode);
    paintMode();
  } else if (key === "m") {
    measure();
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-key]")) {
  button.addEventListener("click", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: button.dataset.key! }));
  });
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

paintStructural();
paintMode();

// setAnimationLoop yalnızca OrbitControls damping'i için koşuyor; ağır iş yapmaz.
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

measure();
