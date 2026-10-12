"use client";

import { useEffect, useState } from "react";

const STORAGE_BASE = "https://hekqxhgjexzxnecwhyao.supabase.co/storage/v1/object/public/football-logos";
const INDEX_URL = `${STORAGE_BASE}/team-logo-index-v20261012.json`;
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

function resolveLogo(index, key) {
  const lookup = (candidate) => index.aliases?.[candidate] || candidate;
  const exactKey = lookup(key);
  const exact = index.logos?.[exactKey];
  if (Array.isArray(exact)) return exact.length === 1 ? exact[0] : null;

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
      const logos = index.logos?.[candidate];
      if (Array.isArray(logos) && logos.length === 1) matches.set(candidate, logos[0]);
      else if (Array.isArray(logos) && logos.length > 1) return null;
    }
  }
  return matches.size === 1 ? matches.values().next().value : null;
}

export function TeamLogo({ team, size = 24 }) {
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    let active = true;
    const key = normalizeTeamName(team);
    setEntry(null);
    if (!key) return () => { active = false; };

    loadIndex()
      .then((index) => {
        // Duplicate names across competitions are intentionally left unmatched.
        const candidate = resolveLogo(index, key);
        if (active && candidate) setEntry({ ...candidate, index });
      })
      .catch(() => {});

    return () => { active = false; };
  }, [team]);

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

export function TeamNameWithLogo({ team, logoTeam = team, size = 24, className = "" }) {
  return (
    <span className={`ft-team-with-logo ${className}`.trim()}>
      <TeamLogo team={logoTeam} size={size} />
      <span>{team}</span>
    </span>
  );
}
