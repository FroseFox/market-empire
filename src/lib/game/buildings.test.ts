import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { BUILDINGS, BUILDING_BY_ID, CITY_EFFECT_CAPS, EXPORT_RATIO, RESOURCE_PRICES, TOURISM, WEAR_PER_DAY, type BuildingType } from "./config";
import { buildingModel } from "../city3d/models";

const T0 = 1_700_000_000_000;
/** Ville test : assez de monde et d'énergie pour que tout tourne à plein. */
const town = (extra: Record<string, number> = {}): E.CityInput => ({ population: 20_000, buildings: { house_xl: 2, power_l: 2, farm_l: 2, tech: 8, park_l: 3, school: 5, fire: 4, hospital: 2, ...extra } });
const FX: (keyof BuildingType)[] = ["tourist", "visitors", "growthBoost", "exportBonus", "wearCut", "capitalBoost", "joy"];

describe("bâtiments : chacun a une fonction", () => {
  it("aucun bâtiment constructible n'est décoratif", () => {
    for (const b of BUILDINGS.filter((x) => x.buildable !== false)) {
      const useful = b.housing || b.revenue || b.energyProd || b.foodProd || b.service || (b.pollution ?? 0) < 0 || FX.some((k) => b[k]);
      expect(useful, b.name).toBeTruthy();
      expect(b.description.length, b.name).toBeGreaterThan(5);
    }
  });

  it("chaque bâtiment a sa maquette 3D", () => {
    const generic = buildingModel("type-inconnu").solid.getAttribute("position").count;
    for (const b of BUILDINGS) expect(buildingModel(b.id).solid.getAttribute("position").count, b.name).not.toBe(generic);
  });

  it("tourisme : le revenu suit l'attrait de la ville", () => {
    const happy = E.computeCity(town({ museum: 1 }));
    expect(happy.tourism.attractiveness).toBeGreaterThan(1);       // ville agréable : mieux que le revenu affiché
    expect(happy.tourism.attractiveness).toBeLessThanOrEqual(TOURISM.max);
    // Même ville, très polluée et sans équipements : les touristes viennent moins
    const grim = E.computeCity({ population: 20_000, buildings: { house_xl: 2, power_l: 2, farm_l: 2, factory_l: 6, museum: 1 } });
    expect(grim.tourism.attractiveness).toBeGreaterThanOrEqual(TOURISM.min);
    expect(grim.tourism.attractiveness).toBeLessThan(happy.tourism.attractiveness - 0.2);
    expect(grim.tourism.revenue / grim.tourism.factor).toBeGreaterThan(0);
    // À attrait 1 et avec tout son personnel, un musée rapporte exactement son revenu affiché
    expect(happy.tourism.revenue / happy.tourism.factor / (happy.employed / happy.jobs)).toBeCloseTo(BUILDING_BY_ID.museum.revenue!, 4);
  });

  it("transports : la gare et l'aéroport amènent des visiteurs, jusqu'au plafond", () => {
    const alone = E.computeCity(town({ museum: 2 })), served = E.computeCity(town({ museum: 2, station: 1, airport: 1 }));
    expect(served.tourism.visitors).toBeCloseTo(0.4, 6);
    expect(served.tourism.revenue / served.tourism.attractiveness).toBeGreaterThan(alone.tourism.revenue / alone.tourism.attractiveness * 1.3);
    expect(E.computeCity(town({ airport: 9 })).tourism.visitors).toBe(CITY_EFFECT_CAPS.visitors);
  });

  it("la gare fait venir plus de nouveaux habitants", () => {
    const room = { population: 5_000, buildings: { house_xl: 2, power_l: 2, farm_l: 2, mall: 8 } };
    const fast = { ...room, buildings: { ...room.buildings, station: 1 } };
    expect(E.computeCity(fast).effects.growthBoost).toBeCloseTo(0.15, 6);
    expect(E.computeCity(fast).growth).toBeGreaterThan(E.computeCity(room).growth);
  });

  it("le port fait vendre les surplus plus cher, plafonné sous le prix d'un contrat", () => {
    const a = E.computeCity(town()), b = E.computeCity(town({ port: 1 }));
    expect(a.energy.balance).toBeGreaterThan(100);
    expect(b.effects.exportRatio).toBeCloseTo(EXPORT_RATIO + 0.05, 6);
    const sold = (c: E.CityStats) => Math.max(0, c.energy.balance) * RESOURCE_PRICES.energy + Math.max(0, c.food.balance) * RESOURCE_PRICES.food;
    expect(b.exportsValue).toBeCloseTo(sold(b) * (EXPORT_RATIO + 0.05), 4);
    expect(E.computeCity(town({ port: 9 })).effects.exportRatio).toBeCloseTo(EXPORT_RATIO + CITY_EFFECT_CAPS.exportBonus, 6);
  });

  it("les ateliers municipaux ralentissent la vétusté", () => {
    const g = { ...E.newGame(T0), population: 2_000, wear: 0.1 };
    expect(E.tickDay(g, {}, T0).wear).toBeCloseTo(0.1 + WEAR_PER_DAY, 6);
    const kept = { ...g, buildings: { ...g.buildings, workshop: 1 } };
    expect(E.tickDay(kept, {}, T0).wear).toBeCloseTo(0.1 + WEAR_PER_DAY * 0.75, 6);
    expect(E.computeCity({ ...kept, buildings: { ...kept.buildings, workshop: 9 } }).effects.wearCut).toBe(CITY_EFFECT_CAPS.wearCut);
  });

  it("le quartier d'affaires fait produire plus de capital aux placements", () => {
    const g = { ...E.newGame(T0), holdings: { AAPL: { qty: 100, avgCost: 100 } } };
    const plain = E.tickDay(g, { AAPL: 100 }, T0).capital!;
    const boosted = E.tickDay({ ...g, buildings: { ...g.buildings, bizdistrict: 2 } }, { AAPL: 100 }, T0).capital!;
    expect(plain).toBeGreaterThan(0);
    expect(boosted).toBeCloseTo(plain * 1.2, 2);
  });

  it("culture et loisirs : des points de satisfaction, visibles dans le détail", () => {
    const c = E.computeCity(town({ museum: 1, stadium: 1 }));
    expect(c.factors.find((f) => f.label === "Culture et loisirs")?.value).toBeCloseTo(0.03, 6);
    expect(E.computeCity(town({ themepark: 9 })).effects.joy).toBe(CITY_EFFECT_CAPS.joy);
  });

  it("le commissariat couvre la sécurité et le centre de recyclage absorbe la pollution", () => {
    expect(E.computeCity({ population: 15_000, buildings: { house_xl: 1, police: 1 } }).services.safety.coverage).toBe(1);
    const dirty = E.computeCity(town({ factory_l: 3 })), clean = E.computeCity(town({ factory_l: 3, recycling: 3 }));
    expect(clean.pollution.absorbed).toBe(dirty.pollution.absorbed + 270);
    expect(clean.pollution.penalty).toBeLessThan(dirty.pollution.penalty);
  });

  it("l'audit d'un bâtiment touristique tient compte de l'attrait", () => {
    const c = E.computeCity(town({ hotel: 1 }));
    expect(E.buildingAudit("hotel", c).revenue).toBeCloseTo(BUILDING_BY_ID.hotel.revenue! * c.tourism.factor * (c.employed / c.jobs), 4);
  });
});
