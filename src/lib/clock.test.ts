import { describe, expect, it } from "vitest";
import { now, setServerTime, skew } from "./clock";

describe("heure du jeu", () => {
  it("mesure l'écart avec le serveur au milieu de la demande", () => {
    expect(skew(10_500, 0, 1_000)).toBe(10_000);
    expect(skew(500, 0, 1_000)).toBe(0);
  });
  it("ignore une réponse impossible", () => {
    expect(skew(NaN, 0, 10)).toBeNull();
    expect(skew(5, 10, 0)).toBeNull();
  });
  it("un téléphone en avance de dix heures reste à l'heure du serveur", () => {
    const t = Date.now(), tenHours = 10 * 3_600_000;
    setServerTime(t - tenHours, t, t);
    expect(Math.abs(now() - (Date.now() - tenHours))).toBeLessThan(1_000);
  });
  it("un petit écart (bruit du réseau) ne change rien", () => {
    const t = Date.now();
    setServerTime(t + 800, t, t);
    expect(Math.abs(now() - Date.now())).toBeLessThan(100);
  });
});
