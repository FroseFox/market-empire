"use client";
import { Network } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";
export default function Page() {
  return <ComingSoon icon={Network} title="Relations" subtitle="Le réseau entre entreprises" phase="Phase 2 · Profondeur boursière"
    points={["Graphe fournisseurs, clients, concurrents, partenaires", "Relations saisies à la main pour ~100 grandes entreprises au départ", "Suivre une actualité d'une entreprise à l'autre"]} />;
}
