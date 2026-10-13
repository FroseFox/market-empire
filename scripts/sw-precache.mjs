// Après `next build` : écrit dans out/sw.js la liste des fichiers du site, pour que le jeu s'ouvre sans réseau.
// La liste change à chaque version du site, donc sw.js aussi : le navigateur installe la nouvelle version tout seul.
// Les fichiers de /_next/static/ ont un nom unique par contenu : un appareil ne retélécharge que ceux qui ont changé.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const SKIP = new Set(["sw.js", ".nojekyll"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(OUT).map((p) => relative(OUT, p).split(sep).join("/")).filter((p) => !SKIP.has(p)).sort();
const hash = createHash("sha256");
const urls = [];
for (const f of files) {
  hash.update(f).update(readFileSync(join(OUT, f)));
  // Les pages sont demandées par leur dossier (« ville/ »), pas par « ville/index.html »
  urls.push(f === "index.html" ? "./" : f.endsWith("/index.html") ? f.slice(0, -"index.html".length) : f);
}
const version = hash.digest("hex").slice(0, 12);

const sw = readFileSync(join(OUT, "sw.js"), "utf8");
const marker = /const PRECACHE = \{ version: "dev", files: \[\] \};/;
if (!marker.test(sw)) throw new Error("sw.js : marqueur PRECACHE introuvable");
writeFileSync(join(OUT, "sw.js"), sw.replace(marker, `const PRECACHE = ${JSON.stringify({ version, files: urls })};`));
console.log(`sw.js : ${urls.length} fichiers pour le hors-ligne (version ${version})`);
