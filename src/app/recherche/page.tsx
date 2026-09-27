"use client";
import { FlaskConical } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";
export default function Page() {
  return <ComingSoon icon={FlaskConical} title="Recherche" subtitle="Arbre de progression" phase="Phase 2 · Profondeur boursière"
    points={["Débloquer indices, ETF, marchés internationaux", "Données financières avancées et analyse sectorielle", "Jamais de bonus artificiel sur les gains en bourse"]} />;
}
