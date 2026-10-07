// Pastilles d'alerte de la ville (pur, testable) : quel problème, au-dessus de quel bâtiment.
// Règle : une pastille se pose sur un bâtiment DU TYPE CONCERNÉ par le problème
// (énergie → centrales, nourriture → exploitations, logements → quartiers, postes vacants → lieux de travail,
// équipement public → équipements de ce service). S'il n'existe aucun bâtiment de ce type, le problème
// concerne la ville entière : la pastille se pose sur la mairie (à défaut, le village d'origine).
import type { CityMarker, MarkerKind } from "@/components/IsoCity";
import { BUILDING_BY_ID, SERVICES, SERVICE_IDS, type BuildingType } from "./config";
import type { CityStats } from "./engine";
import type { Plot } from "./layout";

/** Pas plus de quelques pastilles par problème : la carte doit rester lisible. */
export const MAX_MARKERS = 3;

type Issue = { kind: MarkerKind; weight: (b: BuildingType) => number; label: string; none: string };

export function cityMarkers(plots: Plot[], city: Pick<CityStats, "energy" | "food" | "freeHousing" | "housing" | "openJobs" | "services">): CityMarker[] {
  const issues: Issue[] = [];
  if (city.energy.balance < 0) issues.push({
    kind: "energy", weight: (b) => b.energyProd ?? 0,
    label: "Production d'énergie insuffisante : le reste est importé au prix fort",
    none: "Aucune centrale : toute l'énergie est importée au prix fort",
  });
  if (city.food.balance < 0) issues.push({
    kind: "food", weight: (b) => b.foodProd ?? 0,
    label: "Production de nourriture insuffisante : le reste est importé au prix fort",
    none: "Aucune exploitation : toute la nourriture est importée au prix fort",
  });
  const full = city.freeHousing === 0 && city.housing > 0;
  if (full) issues.push({ kind: "full", weight: (b) => b.housing ?? 0, label: "Logements pleins : la population ne grandit plus", none: "Logements pleins : la population ne grandit plus" });
  // Postes vacants : seulement quand il n'y a plus de logement pour accueillir de nouveaux travailleurs
  if (full && city.openJobs > 0) issues.push({ kind: "staff", weight: (b) => (b.housing ? 0 : b.jobs ?? 0), label: "Postes vacants : il manque des habitants", none: "Postes vacants : il manque des habitants" });
  for (const id of SERVICE_IDS) {
    const s = city.services[id];
    if (!s?.needed || s.coverage >= 1) continue;
    const name = SERVICES[id].label;
    issues.push({ kind: "service", weight: (b) => (b.service === id ? b.serves ?? 1 : 0), label: `${name} : équipements saturés, il en faut d'autres`, none: `${name} : aucun équipement dans la ville` });
  }

  const taken = new Set<string>();
  const key = (p: Plot) => `${p.x},${p.y}`;
  const out: CityMarker[] = [];
  const put = (p: Plot, kind: MarkerKind, label: string) => { taken.add(key(p)); out.push({ x: p.x, y: p.y, kind, label }); };
  // Bâtiments qui représentent la ville entière, par ordre de préférence
  const civic = [
    ...plots.filter((p) => p.id === "townhall"), ...plots.filter((p) => p.id === "village"),
    ...plots.filter((p) => BUILDING_BY_ID[p.id]?.housing).sort((a, b) => (BUILDING_BY_ID[b.id].housing ?? 0) - (BUILDING_BY_ID[a.id].housing ?? 0)),
  ];
  for (const issue of issues) {
    // Une seule pastille par bâtiment : le problème le plus grave (traité en premier) garde la place
    const targets = plots.map((p) => ({ p, w: issue.weight(BUILDING_BY_ID[p.id] ?? ({} as BuildingType)) }))
      .filter((r) => r.w > 0 && !taken.has(key(r.p))).sort((a, b) => b.w - a.w).slice(0, MAX_MARKERS);
    if (targets.length) { for (const { p } of targets) put(p, issue.kind, issue.label); continue; }
    const exists = plots.some((p) => issue.weight(BUILDING_BY_ID[p.id] ?? ({} as BuildingType)) > 0);
    const anchor = civic.find((p) => !taken.has(key(p)));
    if (anchor) put(anchor, issue.kind, exists ? issue.label : issue.none);
  }
  return out;
}
