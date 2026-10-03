"use client";
// Habillage sonore du jeu. Tous les sons sont synthétisés dans le navigateur (Web Audio) :
// aucun fichier à télécharger, aucune dépendance. Palette volontairement sobre : notes douces
// (sinus, triangle), gamme pentatonique, enveloppes courtes ; jamais de son agressif.
// Le joueur peut couper le son ou régler le volume (bouton haut-parleur de la barre du haut).
import { create } from "zustand";

export type Sfx =
  | "tap" | "tab" | "open" | "close" | "toggle"          // interface
  | "ok" | "error" | "notify"                             // retours
  | "buy" | "sell" | "coin" | "research"                  // bourse, subventions, recherche
  | "place" | "build" | "demolish" | "move" | "upgrade" | "undo" | "renovate" // ville
  | "day" | "rank" | "project" | "contract" | "travel";   // temps, progression, monde

type Ctx = BaseAudioContext;
/** Un son = une fonction qui programme ses notes sur un contexte audio, à partir de l'instant `t`. */
type Voice = (ctx: Ctx, out: AudioNode, t: number) => void;

// Gamme pentatonique de do majeur : n'importe quelle suite de ces notes sonne juste.
const N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, E6: 1318.5 };

/** Note avec attaque et extinction douces ; `to` fait glisser la hauteur. */
function tone(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, { type = "sine", gain = 0.18, to, attack = 0.008 }: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}) {
  const osc = ctx.createOscillator(), env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t); osc.stop(t + dur + 0.02);
}
/** Souffle filtré (poussière d'un chantier, glissement d'un panneau). */
function noise(ctx: Ctx, out: AudioNode, t: number, dur: number, { freq = 1200, to, gain = 0.1, q = 0.8 }: { freq?: number; to?: number; gain?: number; q?: number } = {}) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain();
  src.buffer = buf;
  filter.type = "bandpass"; filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t); src.stop(t + dur + 0.02);
}
/** Suite de notes égrenées. */
const arp = (ctx: Ctx, out: AudioNode, t: number, notes: number[], step: number, dur: number, opt?: Parameters<typeof tone>[5]) =>
  notes.forEach((f, i) => tone(ctx, out, t + i * step, f, dur, opt));

export const VOICES: Record<Sfx, Voice> = {
  // Interface : presque inaudible, juste pour donner du toucher
  tap: (c, o, t) => tone(c, o, t, 1500, 0.035, { type: "triangle", gain: 0.05, to: 1100 }),
  tab: (c, o, t) => tone(c, o, t, N.E5, 0.07, { type: "triangle", gain: 0.07 }),
  toggle: (c, o, t) => { tone(c, o, t, N.G4, 0.05, { type: "triangle", gain: 0.07 }); tone(c, o, t + 0.05, N.C5, 0.07, { type: "triangle", gain: 0.07 }); },
  open: (c, o, t) => { noise(c, o, t, 0.12, { freq: 500, to: 2400, gain: 0.035 }); tone(c, o, t, N.G4, 0.1, { gain: 0.05, to: N.C5 }); },
  close: (c, o, t) => { noise(c, o, t, 0.1, { freq: 2200, to: 500, gain: 0.03 }); tone(c, o, t, N.C5, 0.09, { gain: 0.045, to: N.G4 }); },
  // Retours
  ok: (c, o, t) => arp(c, o, t, [N.E5, N.G5], 0.07, 0.14, { gain: 0.1 }),
  error: (c, o, t) => { tone(c, o, t, 220, 0.12, { type: "triangle", gain: 0.12, to: 185 }); tone(c, o, t + 0.11, 185, 0.16, { type: "triangle", gain: 0.1, to: 160 }); },
  notify: (c, o, t) => { tone(c, o, t, N.A5, 0.35, { gain: 0.1 }); tone(c, o, t, N.A5 * 2, 0.25, { gain: 0.03 }); tone(c, o, t + 0.14, N.E6, 0.45, { gain: 0.08 }); },
  // Bourse : l'achat monte, la vente descend ; ni l'un ni l'autre ne « récompense » plus que l'autre
  buy: (c, o, t) => { arp(c, o, t, [N.C5, N.E5, N.G5], 0.055, 0.13, { type: "triangle", gain: 0.1 }); tone(c, o, t + 0.17, N.C6, 0.22, { gain: 0.06 }); },
  sell: (c, o, t) => { arp(c, o, t, [N.G5, N.E5, N.C5], 0.055, 0.13, { type: "triangle", gain: 0.1 }); tone(c, o, t + 0.17, N.G4, 0.22, { gain: 0.06 }); },
  coin: (c, o, t) => { tone(c, o, t, N.E6, 0.09, { type: "square", gain: 0.035 }); tone(c, o, t + 0.07, N.A5 * 2, 0.4, { type: "square", gain: 0.03 }); arp(c, o, t, [N.E5, N.A5, N.E6], 0.07, 0.3, { gain: 0.08 }); },
  research: (c, o, t) => { arp(c, o, t, [N.C5, N.D5, N.G5, N.C6, N.E6], 0.06, 0.28, { gain: 0.08 }); noise(c, o, t, 0.4, { freq: 3000, to: 7000, gain: 0.02, q: 3 }); },
  // Ville
  place: (c, o, t) => tone(c, o, t, N.C5, 0.06, { type: "triangle", gain: 0.08, to: N.G4 }),
  build: (c, o, t) => { tone(c, o, t, 150, 0.14, { type: "sine", gain: 0.22, to: 70 }); noise(c, o, t, 0.12, { freq: 900, gain: 0.05 }); arp(c, o, t + 0.09, [N.G4, N.C5, N.E5], 0.06, 0.16, { type: "triangle", gain: 0.09 }); },
  demolish: (c, o, t) => { noise(c, o, t, 0.3, { freq: 1400, to: 250, gain: 0.11, q: 0.5 }); tone(c, o, t, 130, 0.25, { gain: 0.18, to: 55 }); },
  move: (c, o, t) => { noise(c, o, t, 0.14, { freq: 700, to: 1800, gain: 0.04 }); tone(c, o, t + 0.1, N.E5, 0.09, { type: "triangle", gain: 0.08 }); },
  upgrade: (c, o, t) => { tone(c, o, t, N.C5, 0.3, { type: "triangle", gain: 0.09, to: N.C6 }); arp(c, o, t + 0.22, [N.E6, N.C6], 0.07, 0.2, { gain: 0.07 }); },
  undo: (c, o, t) => { tone(c, o, t, N.E5, 0.16, { type: "triangle", gain: 0.09, to: N.C4 }); },
  renovate: (c, o, t) => { noise(c, o, t, 0.25, { freq: 4000, to: 1500, gain: 0.04, q: 2 }); arp(c, o, t + 0.05, [N.D5, N.G5, N.D5 * 2], 0.08, 0.22, { gain: 0.08 }); },
  // Temps, progression, monde
  day: (c, o, t) => { tone(c, o, t, N.G5, 0.5, { gain: 0.05 }); tone(c, o, t + 0.01, N.C5, 0.5, { gain: 0.04 }); },
  rank: (c, o, t) => { arp(c, o, t, [N.C5, N.E5, N.G5, N.C6], 0.1, 0.3, { type: "triangle", gain: 0.11 }); tone(c, o, t + 0.4, N.E6, 0.6, { gain: 0.08 }); tone(c, o, t + 0.4, N.C6, 0.6, { gain: 0.07 }); tone(c, o, t + 0.4, N.G5, 0.6, { gain: 0.06 }); },
  project: (c, o, t) => { tone(c, o, t, 98, 0.5, { gain: 0.16, to: 65 }); arp(c, o, t + 0.05, [N.C4, N.G4, N.C5, N.E5, N.G5, N.C6], 0.09, 0.4, { type: "triangle", gain: 0.1 }); tone(c, o, t + 0.6, N.E6, 0.8, { gain: 0.07 }); tone(c, o, t + 0.6, N.G5, 0.8, { gain: 0.07 }); },
  contract: (c, o, t) => { tone(c, o, t, N.D5, 0.1, { type: "triangle", gain: 0.09 }); tone(c, o, t + 0.09, N.A5, 0.22, { type: "triangle", gain: 0.09 }); noise(c, o, t, 0.05, { freq: 3500, gain: 0.03 }); },
  travel: (c, o, t) => { noise(c, o, t, 0.6, { freq: 400, to: 3000, gain: 0.05, q: 1.5 }); tone(c, o, t + 0.1, N.G4, 0.5, { gain: 0.07, to: N.D5 * 2 }); },
};

// ─── Réglages (mémorisés sur l'appareil) ───
const KEY = "market-empire-sound";
interface Settings { on: boolean; volume: number }
function loadSettings(): Settings {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (v && typeof v.on === "boolean") return { on: v.on, volume: Math.max(0, Math.min(1, Number(v.volume) || 0.6)) }; } catch { /* réglage par défaut */ }
  return { on: true, volume: 0.6 };
}
export const useSound = create<Settings & { ready: boolean; setOn: (on: boolean) => void; setVolume: (v: number) => void }>((set, get) => ({
  on: true, volume: 0.6, ready: false,
  setOn: (on) => { set({ on }); save(); if (on) play("toggle"); },
  setVolume: (volume) => { set({ volume: Math.max(0, Math.min(1, volume)) }); save(); if (master) master.gain.value = get().volume; play("tab"); },
}));
function save() { const { on, volume } = useSound.getState(); try { localStorage.setItem(KEY, JSON.stringify({ on, volume })); } catch { /* non mémorisé */ } }

// ─── Lecture ───
let audio: AudioContext | null = null, master: GainNode | null = null;
const lastAt: Partial<Record<Sfx, number>> = {};
/** Les navigateurs n'autorisent le son qu'après un premier geste du joueur : le contexte est créé à ce moment-là. */
function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      audio = new AC();
      // Un compresseur léger évite toute saturation quand plusieurs sons se superposent
      const comp = audio.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = audio.createGain();
      master.gain.value = useSound.getState().volume;
      master.connect(comp).connect(audio.destination);
    } catch { audio = null; return null; }
  }
  return audio;
}

export function play(name: Sfx) {
  const s = useSound.getState();
  if (!s.on || !s.ready) return;
  const ctx = context();
  if (!ctx || !master) return;
  const now = performance.now();
  if (now - (lastAt[name] ?? 0) < 70) return; // pas de mitraillage du même son
  lastAt[name] = now;
  if (ctx.state === "suspended") void ctx.resume();
  try { VOICES[name](ctx, master, ctx.currentTime + 0.005); } catch { /* son ignoré */ }
}

let started = false;
/** Lit les réglages et branche les sons d'interface (clics, onglets) sur toute la page. */
export function startSound() {
  if (started || typeof window === "undefined") return;
  started = true;
  useSound.setState({ ...loadSettings() });
  // Premier geste : le son devient possible
  const unlock = () => { useSound.setState({ ready: true }); context(); window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true); };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  // Sons d'interface : un seul écouteur pour tout le site. Un élément peut choisir son son avec data-sfx, ou "none" pour se taire.
  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-sfx], button, a, [role='tab'], summary, select, input[type='checkbox'], input[type='radio']");
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
    const custom = el.dataset.sfx;
    if (custom === "none") return;
    if (custom && custom in VOICES) { play(custom as Sfx); return; }
    if (el.getAttribute("role") === "tab" || el.tagName === "A") play("tab"); else play("tap");
  }, true);
  if (process.env.NODE_ENV !== "production") (window as unknown as { __sfx?: unknown }).__sfx = { VOICES, play };
}
