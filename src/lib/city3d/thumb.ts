// Vignettes des bâtiments : la vraie maquette 3D de la ville, rendue une fois en image (pour le wiki).
// Un seul contexte WebGL, hors écran, pour toutes les vignettes ; chaque image est gardée en mémoire.
// Sans WebGL, `null` : l'appelant affiche alors une icône à la place.
import * as THREE from "three";
import { buildingModel } from "./models";

const SIZE = 240;
const cache = new Map<string, string | null>();
let stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.OrthographicCamera; solid: THREE.Mesh; lit: THREE.Mesh } | null | undefined;

function getStage() {
  if (stage !== undefined) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x7a8a66, 1.25));
    const sun = new THREE.DirectionalLight(0xffe9c4, 1.9);
    sun.position.set(4, 9, 6);
    scene.add(sun);
    const solid = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }));
    const lit = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x345e94, roughness: 0.35 }));
    scene.add(solid, lit);
    stage = { renderer, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50), solid, lit };
  } catch { stage = null; }
  return stage;
}

/** Image (data URL) de la maquette d'un bâtiment, vue comme dans la ville. `null` si le navigateur n'a pas de WebGL. */
export function buildingThumb(id: string): string | null {
  if (cache.has(id)) return cache.get(id)!;
  const s = getStage();
  if (!s) { cache.set(id, null); return null; }
  let url: string | null = null;
  try {
    const m = buildingModel(id);
    s.solid.geometry = m.solid;
    s.lit.visible = !!m.lit;
    if (m.lit) s.lit.geometry = m.lit;
    // Cadrage : le carreau fait 1 de côté ; on recule assez pour voir tout le bâtiment, même les tours
    const half = Math.max(0.82, 0.5 + m.top * 0.4);
    s.cam.left = -half; s.cam.right = half; s.cam.top = half; s.cam.bottom = -half;
    const cy = Math.max(0.12, m.top * 0.42);
    s.cam.position.set(8, cy + 6.2, 8);
    s.cam.lookAt(0, cy, 0);
    s.cam.updateProjectionMatrix();
    s.renderer.render(s.scene, s.cam);
    url = s.renderer.domElement.toDataURL("image/png");
  } catch { url = null; }
  cache.set(id, url);
  return url;
}

// File d'attente : une vignette par image d'écran, pour ne jamais figer la page.
const queue: { id: string; done: (url: string | null) => void }[] = [];
let running = false;
function pump() {
  const job = queue.shift();
  if (!job) { running = false; return; }
  job.done(buildingThumb(job.id));
  requestAnimationFrame(pump);
}
/** Demande une vignette sans bloquer. Renvoie de quoi annuler si le composant disparaît entre-temps. */
export function requestThumb(id: string, done: (url: string | null) => void): () => void {
  if (cache.has(id)) { done(cache.get(id)!); return () => {}; }
  const job = { id, done };
  queue.push(job);
  if (!running) { running = true; requestAnimationFrame(pump); }
  return () => { const i = queue.indexOf(job); if (i >= 0) queue.splice(i, 1); };
}
