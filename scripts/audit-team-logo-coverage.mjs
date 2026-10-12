import registry from "../data/team-logo-aliases.json" with { type: "json" };
import { readFile } from "node:fs/promises";

const snapshotUrl = "https://fast-tracker-dashboard-production.up.railway.app/snapshot";
const storageBase = "https://hekqxhgjexzxnecwhyao.supabase.co/storage/v1/object/public/football-logos";
const indexArgument = process.argv[2] || "v20261012b";
const localIndexPath = indexArgument.endsWith(".json") ? indexArgument : null;
const indexVersion = localIndexPath ? null : indexArgument;

function normalize(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const suffixes = new Set([
  "fc", "cf", "sc", "ac", "afc", "club", "w", "women", "u17", "u18",
  "u19", "u20", "u21", "u22", "u23", "b", "reserve", "reserves", "sau",
  "uae", "qat", "oma", "irq", "irn", "uzb", "tha", "vie", "chn", "jor",
]);

function resolve(index, name, context = "") {
  const key = normalize(name);
  const normalizedContext = normalize(context);
  const scopedTargets = (registry.contextualAliases?.[key] || [])
    .filter((entry) => normalizedContext.includes(normalize(entry.competitionContains)))
    .map((entry) => entry.target);
  if (scopedTargets.length === 1) {
    const scopedLogo = index.logos?.[scopedTargets[0]];
    return Array.isArray(scopedLogo) && scopedLogo.length === 1 ? scopedTargets[0] : null;
  }
  if (scopedTargets.length > 1) return null;
  const lookup = (candidate) => registry.aliases?.[candidate] || index.aliases?.[candidate] || candidate;
  const logoFor = (target) => {
    const direct = index.logos?.[target];
    if (Array.isArray(direct)) return direct.length === 1 ? direct[0] : null;
    const disambiguation = registry.disambiguatedLogos?.[target];
    if (!disambiguation) return null;
    return (index.logos?.[disambiguation.sourceKey] || []).find((entry) => entry.source === disambiguation.source) || null;
  };
  const direct = index.logos?.[lookup(key)];
  if (Array.isArray(direct)) return direct.length === 1 ? lookup(key) : null;
  const directMapped = logoFor(lookup(key));
  if (directMapped) return lookup(key);

  const variants = new Set();
  let parts = key.split(" ");
  while (parts.length && suffixes.has(parts.at(-1))) {
    parts = parts.slice(0, -1);
    if (parts.length) variants.add(parts.join(" "));
  }
  const withoutMarkers = key.split(" ").filter((part) => !suffixes.has(part)).join(" ");
  if (withoutMarkers) variants.add(withoutMarkers);

  const matches = new Set();
  for (const variant of variants) {
    const base = lookup(variant);
    for (const candidate of [base, `${base} national team`]) {
      const logo = logoFor(candidate);
      if (logo) matches.add(candidate);
    }
  }
  return matches.size === 1 ? [...matches][0] : null;
}

const [snapshotResponse, indexResponse] = await Promise.all([
  fetch(snapshotUrl, { cache: "no-store" }),
  localIndexPath
    ? readFile(localIndexPath, "utf8").then((body) => ({ ok: true, json: async () => JSON.parse(body) }))
    : fetch(`${storageBase}/team-logo-index-${indexVersion}.json`, { cache: "no-store" }),
]);
if (!snapshotResponse.ok) throw new Error(`Production snapshot returned ${snapshotResponse.status}`);
if (!indexResponse.ok) throw new Error(`Team logo index returned ${indexResponse.status}`);

const [snapshot, index] = await Promise.all([snapshotResponse.json(), indexResponse.json()]);
// `discovered` is the full raw Flashscore feed. `fixtures` is a smaller, filtered
// subset used by other dashboard features and undercounts the displayed matches.
const sourceFixtures = Array.isArray(snapshot.discovered) ? snapshot.discovered : snapshot.fixtures || [];
const teams = [...new Set(sourceFixtures.flatMap((fixture) => [fixture.home, fixture.away]).filter(Boolean))].sort();
const contexts = new Map();
for (const fixture of sourceFixtures) {
  for (const team of [fixture.home, fixture.away]) {
    if (!team) continue;
    const key = normalize(team);
    if (!contexts.has(key)) contexts.set(key, []);
    contexts.get(key).push(fixture.competition || "");
  }
}
const unresolved = teams.filter((team) => !(contexts.get(normalize(team)) || []).some((context) => resolve(index, team, context)));
console.log(JSON.stringify({
  snapshotCapturedAt: snapshot.captured_at,
  displayedFixtures: sourceFixtures.length,
  filteredFixtures: snapshot.fixtures?.length || 0,
  uniqueTeams: teams.length,
  matchedTeams: teams.length - unresolved.length,
  coveragePercent: teams.length ? Number(((teams.length - unresolved.length) * 100 / teams.length).toFixed(1)) : 100,
  unresolvedTeams: unresolved,
  atlas: index.atlas,
  indexedAssets: index.count,
}, null, 2));
if (unresolved.length) process.exitCode = 1;
