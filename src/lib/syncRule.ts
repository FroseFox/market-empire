// Règle de synchronisation entre plusieurs appareils d'un même compte (sans dépendance, pour être testée seule).

/** Que faire à l'ouverture, quand une sauvegarde en ligne existe ?
 *  - pull : reprendre la sauvegarde en ligne (appareil jamais lié à ce compte, ou partie modifiée ailleurs) ;
 *  - push : envoyer la partie de l'appareil (il était à jour et a avancé depuis) ;
 *  - same : rien à faire. */
export function openingMove(o: { linked: boolean; remoteAt: number; syncedAt: number | null; localAt: number }): "pull" | "push" | "same" {
  if (!o.linked || o.syncedAt === null || o.remoteAt !== o.syncedAt) return "pull";
  return o.localAt !== o.remoteAt ? "push" : "same";
}
