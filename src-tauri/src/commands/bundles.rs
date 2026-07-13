//! Bundles command. Returns the curated bundle recipes from the generated
//! `bundles.json`, embedded into the binary at compile time via `include_str!`
//! — the same mechanism the bundled `categories.json` uses (`commands::categories`).
//! No runtime file dependency, no disk read on every call.
//!
//! The `bundles.json` artifact is produced by `scripts/validate-recipes.mjs`
//! (concatenates the validated `recipes/*.json`). This module reads the copy
//! staged at `src-tauri/data/bundles.json`.
//!
//! Tolerant decode: the file is parsed as a JSON value first, then each entry
//! in `bundles[]` is deserialized independently. A single malformed recipe is
//! skipped (logged), never fatal — so one bad live-refreshed recipe can't take
//! down the whole list.

use crate::types::{Bundle, BundlesFile};

const BUNDLES_JSON: &str = include_str!("../../data/bundles.json");

/// Parse a `bundles.json` string into the valid bundles, skipping any single
/// malformed entry. Split out from the command so it's unit-testable without
/// a Tauri runtime.
///
/// Fast path: strict-parse the whole file into [`BundlesFile`] — the common
/// case where every recipe is valid. Only if that fails (a single malformed
/// recipe fails the whole `Vec<Bundle>` decode) do we fall back to a per-entry
/// tolerant parse that salvages the good recipes and skips (logs) the bad one.
/// A completely unparseable file yields an empty list.
///
/// `pub(crate)` so the live-refresh path (`crate::bundles_live`) reuses the
/// exact same tolerant decode on the host-served payload.
pub(crate) fn parse_bundles(json: &str) -> Vec<Bundle> {
    if let Ok(file) = serde_json::from_str::<BundlesFile>(json) {
        return file.bundles;
    }

    // Tolerant fallback: one bad recipe must not sink the batch.
    let root: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("bundles.json is not valid JSON: {e}");
            return Vec::new();
        }
    };

    let Some(entries) = root.get("bundles").and_then(|b| b.as_array()) else {
        tracing::warn!("bundles.json has no `bundles` array");
        return Vec::new();
    };

    entries
        .iter()
        .filter_map(|entry| match serde_json::from_value::<Bundle>(entry.clone()) {
            Ok(bundle) => Some(bundle),
            Err(e) => {
                let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("<unknown>");
                tracing::warn!("skipping malformed bundle '{id}': {e}");
                None
            }
        })
        .collect()
}

/// Return the curated bundles bundled with the app. Infallible — a parse
/// problem degrades to fewer (or zero) bundles rather than erroring the call.
#[tauri::command]
pub async fn bundles() -> Vec<Bundle> {
    parse_bundles(BUNDLES_JSON)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_bundles_parse() {
        let list = parse_bundles(BUNDLES_JSON);
        assert_eq!(list.len(), 6, "expected 6 first-party bundles");

        // Spot-check local-llm: 2 packages, requires.minRamGB == 8, and a
        // service setup step for ollama.
        let llm = list
            .iter()
            .find(|b| b.id == "local-llm")
            .expect("local-llm bundle must be present");
        assert_eq!(llm.packages.len(), 2, "local-llm has 2 packages");
        assert_eq!(llm.packages[0].name, "ollama");
        assert_eq!(llm.packages[0].kind, "formula");
        let requires = llm.requires.as_ref().expect("local-llm declares requires");
        assert_eq!(requires.min_ram_gb, 8);
        assert!(
            llm.setup.iter().any(|s| s.kind == "service" && s.service.as_deref() == Some("ollama")),
            "local-llm has a service setup step for ollama"
        );
    }

    #[test]
    fn malformed_bundle_is_skipped_not_fatal() {
        // Two valid recipes surrounding one that can't deserialize (packages
        // is the wrong shape). The batch must yield the two good ones.
        let json = r#"{
            "schemaVersion": 1,
            "bundles": [
                { "id": "good-one", "name": "Good One", "tagline": "t", "category": "Data", "packages": [{ "name": "redis", "kind": "formula" }] },
                { "id": "bad", "name": "Bad", "packages": "not-an-array" },
                { "id": "good-two", "name": "Good Two", "tagline": "t", "category": "Media", "packages": [{ "name": "mpv", "kind": "formula" }] }
            ]
        }"#;
        let list = parse_bundles(json);
        assert_eq!(list.len(), 2, "the malformed middle recipe is skipped");
        assert_eq!(list[0].id, "good-one");
        assert_eq!(list[1].id, "good-two");
    }

    #[test]
    fn unknown_fields_are_ignored() {
        // Forward-compat: a recipe from a newer schema (extra top-level key)
        // still parses; the unknown field is dropped.
        let json = r#"{
            "schemaVersion": 2,
            "bundles": [
                { "id": "fut", "name": "Future", "tagline": "t", "category": "AI",
                  "packages": [{ "name": "ollama", "kind": "formula" }],
                  "somethingNew": { "nested": true } }
            ]
        }"#;
        let list = parse_bundles(json);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "fut");
    }

    #[test]
    fn empty_on_garbage_input() {
        assert!(parse_bundles("not json at all").is_empty());
        assert!(parse_bundles(r#"{ "schemaVersion": 1 }"#).is_empty());
    }
}
