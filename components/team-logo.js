"use client";

import { useEffect, useState } from "react";
import matchingRegistry from "@/data/team-logo-aliases.json";

const STORAGE_BASE = "https://hekqxhgjexzxnecwhyao.supabase.co/storage/v1/object/public/football-logos";
const INDEX_URL = `${STORAGE_BASE}/team-logo-index-v20261012b.json`;
const FALLBACK_INDEX_URL = `${STORAGE_BASE}/team-logo-index-v20261012.json`;
let indexPromise;

const IGNORABLE_SUFFIXES = new Set([
  "fc", "cf", "sc", "ac", "afc", "club", "w", "women", "u17", "u18",
  "u19", "u20", "u21", "u22", "u23", "b", "reserve", "reserves", "sau", "uae",
  "qat", "oma", "irq", "irn", "uzb", "tha", "vie", "chn", "jor",
]);

function normalizeTeamName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL, { cache: "force-cache" })
      .then((response) => {
        if (response.status === 404) {
          return fetch(FALLBACK_INDEX_URL, { cache: "force-cache" }).then((fallback) => {
            if (!fallback.ok) throw new Error(`Logo index returned ${fallback.status}`);
            return fallback.json();
          });
        }
        if (!response.ok) throw new Error(`Logo index returned ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

function resolveLogo(index, key, context) {
  const scoped = matchingRegistry.contextualAliases?.[key] || [];
  const normalizedContext = normalizeTeamName(context);
  const scopedTargets = scoped
    .filter((entry) => normalizedContext.includes(normalizeTeamName(entry.competitionContains)))
    .map((entry) => entry.target);
  if (scopedTargets.length === 1) {
    const logo = index.logos?.[scopedTargets[0]];
    return Array.isArray(logo) && logo.length === 1 ? logo[0] : null;
  }
  if (scopedTargets.length > 1) return null;

  const lookup = (candidate) => matchingRegistry.aliases?.[candidate] || index.aliases?.[candidate] || candidate;
  const logoFor = (target) => {
    const direct = index.logos?.[target];
    if (Array.isArray(direct)) return direct.length === 1 ? direct[0] : null;
    const disambiguation = matchingRegistry.disambiguatedLogos?.[target];
    if (!disambiguation) return null;
    const candidates = index.logos?.[disambiguation.sourceKey] || [];
    return candidates.find((entry) => entry.source === disambiguation.source) || null;
  };
  const exactKey = lookup(key);
  const exact = logoFor(exactKey);
  if (exact) return exact;

  const variants = new Set();
  let parts = key.split(" ");
  while (parts.length && IGNORABLE_SUFFIXES.has(parts.at(-1))) {
    parts = parts.slice(0, -1);
    if (parts.length) variants.add(parts.join(" "));
  }
  const withoutMarkers = key.split(" ").filter((part) => !IGNORABLE_SUFFIXES.has(part)).join(" ");
  if (withoutMarkers) variants.add(withoutMarkers);

  const matches = new Map();
  for (const variant of variants) {
    const baseKey = lookup(variant);
    for (const candidate of [baseKey, `${baseKey} national team`]) {
      const logo = logoFor(candidate);
      if (logo) matches.set(candidate, logo);
      else if (Array.isArray(index.logos?.[candidate]) && index.logos[candidate].length > 1) return null;
    }
  }
  return matches.size === 1 ? matches.values().next().value : null;
}

export function TeamLogo({ team, context = "", size = 24 }) {
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    let active = true;
    const key = normalizeTeamName(team);
    setEntry(null);
    if (!key) return () => { active = false; };

    loadIndex()
      .then((index) => {
        // Duplicate names across competitions are intentionally left unmatched.
        const candidate = resolveLogo(index, key, context);
        if (active && candidate) setEntry({ ...candidate, index });
      })
      .catch(() => {});

    return () => { active = false; };
  }, [team, context]);

  if (!entry) return null;
  const { index, x, y } = entry;
  const tile = size;
  return (
    <span
      aria-hidden="true"
      className="ft-team-logo"
      style={{
        width: tile,
        height: tile,
        flexBasis: tile,
        backgroundImage: `url("${STORAGE_BASE}/${index.atlas}")`,
        backgroundSize: `${index.columns * tile}px ${index.rows * tile}px`,
        backgroundPosition: `-${x * tile}px -${y * tile}px`,
      }}
    />
  );
}

export function TeamNameWithLogo({ team, logoTeam = team, context = "", size = 24, className = "" }) {
  return (
    <span className={`ft-team-with-logo ${className}`.trim()}>
      <TeamLogo team={logoTeam} context={context} size={size} />
      <span>{team}</span>
    </span>
  );
}
