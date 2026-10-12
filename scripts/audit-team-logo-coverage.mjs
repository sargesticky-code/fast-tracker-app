const snapshotUrl = "https://fast-tracker-dashboard-production.up.railway.app/snapshot";
const storageBase = "https://hekqxhgjexzxnecwhyao.supabase.co/storage/v1/object/public/football-logos";

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

function resolve(index, name) {
  const key = normalize(name);
  const aliases = index.aliases || {};
  const lookup = (candidate) => aliases[candidate] || candidate;
  const direct = index.logos?.[lookup(key)];
  if (Array.isArray(direct)) return direct.length === 1 ? lookup(key) : null;

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
      const logos = index.logos?.[candidate];
      if (Array.isArray(logos) && logos.length === 1) matches.add(candidate);
    }
  }
  return matches.size === 1 ? [...matches][0] : null;
}

const [snapshotResponse, indexResponse] = await Promise.all([
  fetch(snapshotUrl, { cache: "no-store" }),
  fetch(`${storageBase}/team-logo-index-v20261012.json`, { cache: "no-store" }),
]);
if (!snapshotResponse.ok) throw new Error(`Production snapshot returned ${snapshotResponse.status}`);
if (!indexResponse.ok) throw new Error(`Team logo index returned ${indexResponse.status}`);

const [snapshot, index] = await Promise.all([snapshotResponse.json(), indexResponse.json()]);
const teams = [...new Set((snapshot.fixtures || []).flatMap((fixture) => [fixture.home, fixture.away]).filter(Boolean))].sort();
const unresolved = teams.filter((team) => !resolve(index, team));
console.log(JSON.stringify({
  snapshotCapturedAt: snapshot.captured_at,
  fixtures: snapshot.fixtures?.length || 0,
  uniqueTeams: teams.length,
  matchedTeams: teams.length - unresolved.length,
  unresolvedTeams: unresolved,
  atlas: index.atlas,
  indexedAssets: index.count,
}, null, 2));
if (unresolved.length) process.exitCode = 1;
