import { describe, expect, it } from "vitest";
import { matcher, searchWiki, type WikiBlock } from "./wikiSearch";

let key = 0;
const b = (section: string, sectionTitle: string, heading: string, kind: WikiBlock["kind"], text: string): WikiBlock => ({ key: key++, section, sectionTitle, heading, kind, text });
const WIKI: WikiBlock[] = [
  b("ville", "Revenus et dépenses", "", "title", "Revenus et dépenses"),
  b("ville", "Revenus et dépenses", "Les impôts", "heading", "Les impôts"),
  b("ville", "Revenus et dépenses", "Les impôts", "text", "Chaque habitant paie un impôt local par jour. C’est le revenu de base de la ville."),
  b("ville", "Revenus et dépenses", "La pollution", "text", "La pollution des usines fait baisser la satisfaction ; un parc la compense."),
  b("levier", "Levier et Banque", "", "title", "Levier et Banque"),
  b("levier", "Levier et Banque", "Emprunter", "text", "Avec le levier, vous achetez plus que vos liquidités : le reste est une dette."),
  b("levier", "Levier et Banque", "La Banque", "text", "Elle verse un intérêt chaque jour sur ce que vous y déposez."),
  b("alliances", "Alliances", "", "title", "Alliances"),
  b("alliances", "Alliances", "", "text", "Une alliance réunit plusieurs villes autour d’une caisse commune."),
];
const first = (q: string) => searchWiki(q, WIKI)[0]?.block;

describe("recherche du wiki", () => {
  it("ignore les accents, les majuscules et le pluriel", () => {
    expect(first("IMPOTS")?.heading).toBe("Les impôts");
    expect(first("impôt")?.heading).toBe("Les impôts");
  });
  it("trouve dès le début du mot", () => {
    expect(first("pollu")?.heading).toBe("La pollution");
  });
  it("pardonne une faute d'une lettre", () => {
    expect(first("polution")?.heading).toBe("La pollution");
    expect(first("aliance")?.section).toBe("alliances");
  });
  it("comprend les mots voisins", () => {
    expect(searchWiki("argent", WIKI).some((h) => h.block.text.includes("liquidités"))).toBe(true);
    expect(first("clan")?.section).toBe("alliances");
  });
  it("met le titre de la rubrique avant un passage qui cite le mot", () => {
    expect(first("levier")?.kind).toBe("title");
  });
  it("accepte qu'un mot soit dans le titre et l'autre dans le passage", () => {
    expect(first("banque intérêt")?.text).toContain("intérêt");
  });
  it("laisse de côté les petits mots", () => {
    expect(first("comment faire une alliance")?.section).toBe("alliances");
  });
  it("ne renvoie rien quand rien ne répond", () => {
    expect(searchWiki("zzzz", WIKI)).toEqual([]);
    expect(searchWiki("   ", WIKI)).toEqual([]);
  });
  it("découpe l'extrait autour des mots trouvés", () => {
    const hit = searchWiki("dette", WIKI)[0];
    expect(hit.snippet.filter((p) => p.hit).map((p) => p.text)).toEqual(["dette"]);
    expect(hit.snippet.map((p) => p.text).join("")).toContain("levier");
  });
  it("dit quels mots surligner dans la page", () => {
    const is = matcher("impots");
    expect(is("impôt")).toBe(true);
    expect(is("Impôts")).toBe(true);
    expect(is("ville")).toBe(false);
  });
});
