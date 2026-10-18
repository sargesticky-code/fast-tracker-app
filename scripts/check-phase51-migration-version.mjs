import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Phase 51 is already applied in production under this exact Supabase version.
// Duplicating its destructive retirement SQL under a new version is unsafe.
const dir = "supabase/migrations";
const expected = "20261018125055_phase51_retire_legacy_hkjc_dependent_models.sql";
const expectedApplied = {
  phase49: "20261018120209_phase49_english_premier_form_native_id_guard.sql",
  phase50: "20261018121154_phase50_football_data_super_alias_inventory.sql",
  phase51: expected
};
for (const [phase, appliedFile] of Object.entries(expectedApplied)) {
  const phaseFiles = readdirSync(dir).filter(x =>
    new RegExp("^\\d{14}_.*" + phase + ".*\\.sql$").test(x));
  assert.deepEqual(phaseFiles, [appliedFile],
    "Duplicate or mismatched already-applied migration: " + phase);
}
const sql = readFileSync(join(dir, expected), "utf8");
for (const required of [
  "REFUSE_DELETE_NONLEGACY_MODEL_RECORDS",
  "ft_model_source_never_hkjc",
  "ft_form_source_never_hkjc",
  "phase4.refresh_model_consensus"
]) {
  assert.ok(sql.includes(required), "Phase 51 guard removed: " + required);
}
assert.match(sql, /TRUNCATE TABLE public\.model_predictions,public\.form_predictions/);
assert.match(sql, /COMMIT;\s*$/);
console.log("PHASE51_LIVE_MIGRATION_VERSION_PARITY_PASSED", expected);
