import type { MetadataRoute } from "next";

// Fiche d'installation : avec elle, le navigateur propose « Installer » et le jeu s'ouvre comme une appli
// (icône sur l'écran d'accueil ou le bureau, plein écran, sans barre d'adresse).
// Les adresses sont relatives à ce fichier : elles restent justes sous /market-empire/ comme en local.
// Pas de mise en cache hors ligne : l'appli charge toujours la dernière version du site.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "market-empire",
    name: "Market Empire",
    short_name: "Market Empire",
    description: "Construis, investis, domine : un jeu de stratégie économique basé sur les vrais marchés.",
    lang: "fr",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "any",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    categories: ["games", "finance"],
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ville", url: "./ville/" },
      { name: "Marchés", url: "./marches/" },
      { name: "Monde", url: "./monde/" },
    ],
  };
}
