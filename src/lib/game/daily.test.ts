import { describe, expect, it } from "vitest";
import { computeCity, newGame } from "./engine";
import { DAILY, claimBonus, claimGift, claimMission, daysBetween, giftFor, missionStatuses, parisDate, refreshDaily, rewardUnit } from "./daily";

const start = () => newGame(Date.UTC(2026, 9, 1, 8));

describe("missions du jour", () => {
  it("date de Paris, y compris autour de minuit", () => {
    expect(parisDate(Date.UTC(2026, 9, 14, 21, 59))).toBe("2026-10-14"); // 23 h 59 à Paris (heure d'été)
    expect(parisDate(Date.UTC(2026, 9, 14, 22, 1))).toBe("2026-10-15"); // 0 h 01
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // passage à l'heure d'été
  });

  it("tire trois missions différentes, toujours les mêmes pour une partie et un jour", () => {
    const g = start();
    const a = refreshDaily(g, "2026-10-14"), b = refreshDaily(g, "2026-10-14");
    expect(a.daily!.missions).toHaveLength(DAILY.missions);
    expect(new Set(a.daily!.missions.map((m) => m.kind)).size).toBe(DAILY.missions);
    expect(b.daily!.missions).toEqual(a.daily!.missions);
    expect(refreshDaily(a, "2026-10-14")).toBe(a); // même jour : rien ne change
    // Sur plusieurs jours, les missions varient
    const kinds = new Set<string>();
    for (let d = 1; d <= 20; d++) refreshDaily(g, `2026-11-${String(d).padStart(2, "0")}`).daily!.missions.forEach((m) => kinds.add(m.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it("une mission réussie s'encaisse une fois, puis le bonus des trois", () => {
    let g = refreshDaily(start(), "2026-10-14");
    // On remplit chaque mission en trichant sur l'état
    g = { ...g, daily: { ...g.daily!, missions: g.daily!.missions.map((m) => ({ ...m, base: m.kind === "joy" ? m.base : m.base - 1_000_000, target: m.kind === "joy" ? 0 : m.target })) } };
    expect(missionStatuses(g).every((s) => s.done)).toBe(true);
    expect(claimBonus(g, 1).ok).toBe(false);
    for (let i = 0; i < DAILY.missions; i++) {
      const r = claimMission(g, i, 1);
      expect(r.ok).toBe(true);
      if (r.ok) { expect(r.state.cash).toBe(g.cash + r.amount); g = r.state; }
    }
    expect(claimMission(g, 0, 1).ok).toBe(false);
    const b = claimBonus(g, 1);
    expect(b.ok && b.amount).toBe(g.daily!.unit * DAILY.bonusUnits);
    if (b.ok) expect(claimBonus(b.state, 1).ok).toBe(false);
  });

  it("une mission pas faite ne paie pas", () => {
    const g = refreshDaily(start(), "2026-10-14");
    const i = missionStatuses(g).findIndex((s) => !s.done);
    expect(claimMission(g, i, 1).ok).toBe(false);
  });
});

describe("série de connexions", () => {
  const open = (dates: string[]) => dates.reduce((g, d) => refreshDaily(g, d), start());

  it("compte les jours d'affilée et repart à 1 après un trou", () => {
    expect(open(["2026-10-01", "2026-10-02", "2026-10-03"]).daily!.streak).toBe(3);
    expect(open(["2026-10-01", "2026-10-02", "2026-10-05"]).daily!.streak).toBe(1);
  });

  it("un joker (gagné au 7e jour) sauve un seul jour manqué", () => {
    const week = Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`);
    const g = open(week);
    expect(g.daily!.streak).toBe(7);
    expect(g.daily!.jokers).toBe(1);
    const saved = refreshDaily(g, "2026-10-09"); // le 8 manqué
    expect(saved.daily!.streak).toBe(8);
    expect(saved.daily!.jokers).toBe(0);
    expect(saved.daily!.saved).toBe(true);
    expect(refreshDaily(saved, "2026-10-11").daily!.streak).toBe(1); // plus de joker
    expect(open([...week, "2026-10-10"]).daily!.streak).toBe(1); // deux jours manqués : perdu
    expect(open(["2026-10-01", "2026-10-02"]).daily!.best).toBe(2);
  });

  it("cadeau du jour : une fois par jour, plus gros avec la série, plafonné", () => {
    const g = open(["2026-10-01", "2026-10-02", "2026-10-03"]);
    const r = claimGift(g, 1);
    expect(r.ok && r.amount).toBe(giftFor(g.daily!.unit, 3));
    if (r.ok) expect(claimGift(r.state, 1).ok).toBe(false);
    expect(giftFor(1000, 1)).toBe(1000);
    expect(giftFor(1000, 3)).toBe(1500);
    expect(giftFor(1000, 50)).toBe(3000);
  });

  it("récompenses à l'échelle de la ville, bornées", () => {
    const c = computeCity(start());
    expect(rewardUnit(c)).toBeGreaterThanOrEqual(DAILY.unitMin);
    expect(rewardUnit({ ...c, net: 10_000_000 })).toBe(DAILY.unitMax);
    expect(rewardUnit({ ...c, net: -5_000 })).toBe(DAILY.unitMin);
  });
});

describe("rappel de série", () => {
  it("le lendemain à 19 h, heure de Paris (été comme hiver)", async () => {
    const { parisTime, nextDate, streakReminder } = await import("./daily");
    expect(new Date(parisTime("2026-10-15", 19)).toISOString()).toBe("2026-10-15T17:00:00.000Z"); // heure d'été
    expect(new Date(parisTime("2026-12-15", 19)).toISOString()).toBe("2026-12-15T18:00:00.000Z"); // heure d'hiver
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
    const g = ["2026-10-13", "2026-10-14"].reduce((s, d) => refreshDaily(s, d), start());
    expect(streakReminder(g.daily)!.at).toBe(parisTime("2026-10-15", 19));
    expect(streakReminder(refreshDaily(start(), "2026-10-14").daily)).toBeNull(); // série d'un jour : pas de rappel
  });
});
