"use client";
import { Folder } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";
export default function Page() {
  return <ComingSoon icon={Folder} title="Dossiers" subtitle="Votre propre système d'analyse" phase="Phase 2 · Profondeur boursière"
    points={["Créer des dossiers thématiques (IA, énergie, automobile…)", "Suivre les performances et actualités d'un groupe d'entreprises", "Ajouter des notes personnelles"]} />;
}
