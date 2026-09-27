"use client";
import { Newspaper } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";
export default function Page() {
  return <ComingSoon icon={Newspaper} title="Actualités" subtitle="Le centre d'information économique" phase="Phase 2 · Profondeur boursière"
    points={["Vraies actualités financières (titre, source, lien)", "Reliées aux entreprises, secteurs et pays", "Aucune fausse actualité, aucune prédiction : le joueur analyse lui-même"]} />;
}
