"use client";
import { Globe2 } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";
export default function Page() {
  return <ComingSoon icon={Globe2} title="Monde" subtitle="Carte géopolitique et économique" phase="Phase 4 · Multijoueur"
    points={["Carte du monde avec les territoires des joueurs", "Alliés, neutres et rivaux", "Marché des ressources entre joueurs", "Contrats et classements"]} />;
}
