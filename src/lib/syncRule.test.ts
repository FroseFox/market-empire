import { describe, expect, it } from "vitest";

import { openingMove } from "./syncRule";

describe("ouverture de la partie sur un appareil", () => {
  it("reprend la sauvegarde en ligne quand un autre appareil a joué depuis", () => {
    // L'appareil était à jour avec la sauvegarde 100 ; elle vaut maintenant 200.
    // Sa date locale est plus récente (un jour de ville rattrapé à l'ouverture) : elle ne doit pas le faire gagner.
    expect(openingMove({ linked: true, remoteAt: 200, syncedAt: 100, localAt: 999 })).toBe("pull");
  });
  it("envoie la partie quand l'appareil était à jour et a avancé", () => {
    expect(openingMove({ linked: true, remoteAt: 100, syncedAt: 100, localAt: 150 })).toBe("push");
  });
  it("ne fait rien quand tout est identique", () => {
    expect(openingMove({ linked: true, remoteAt: 100, syncedAt: 100, localAt: 100 })).toBe("same");
  });
  it("reprend la sauvegarde en ligne sur un appareil jamais lié au compte ou jamais synchronisé", () => {
    expect(openingMove({ linked: false, remoteAt: 100, syncedAt: 100, localAt: 500 })).toBe("pull");
    expect(openingMove({ linked: true, remoteAt: 100, syncedAt: null, localAt: 500 })).toBe("pull");
  });
});
