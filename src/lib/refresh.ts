// Rythme de relecture des données qui ne changent qu'une fois par heure côté serveur (cours, actualités) :
// inutile de les redemander plus souvent, chaque requête compte dans le trafic du plan gratuit de Supabase.

/** Premier instant après `at` qui tombe à la minute `minute` d'une heure (UTC : juste pour toutes les heures locales). */
export function nextHourly(at: number, minute: number): number {
  const d = new Date(at);
  d.setUTCMinutes(minute, 0, 0);
  if (d.getTime() <= at) d.setUTCHours(d.getUTCHours() + 1);
  return d.getTime();
}
