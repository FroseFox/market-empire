-- Journal des tâches planifiées : chaque exécution (cours, actualités, notifications…) y laisse une ligne, jamais effacée.
-- Il grossissait d'environ 0,45 Mo par jour (~165 Mo par an, pour une base limitée à 500 Mo en plan gratuit).
-- Chaque nuit, on ne garde que les 3 derniers jours (assez pour comprendre une panne).
select cron.schedule('cron-log-cleanup', '23 4 * * *', $cron$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
$cron$);
