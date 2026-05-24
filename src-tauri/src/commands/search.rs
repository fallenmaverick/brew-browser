//! `brew_search` and `brew_search_desc` commands.
//!
//! `brew search` does not support `--json=v2`, so we parse plain stdout.
//! Per spec §11.1 recommendation we run formula + cask searches in parallel.

use std::collections::HashSet;

use chrono::Utc;
use tauri::State;

use crate::brew::exec::run_brew_capture;
use crate::brew::parse::parse_search_stdout;
use crate::commands::info::validate_package_name;
use crate::error::BrewError;
use crate::state::AppState;
use crate::types::{PackageKind, SearchHit, SearchResults};

#[tauri::command]
pub async fn brew_search(
    query: String,
    state: State<'_, AppState>,
) -> Result<SearchResults, BrewError> {
    validate_search_query(&query)?;
    let path = state.require_brew_path().await?;

    let path1 = path.clone();
    let path2 = path.clone();
    let q1 = query.clone();
    let q2 = query.clone();

    let f_task = tokio::spawn(async move {
        run_brew_capture(
            &path1,
            &["search", "--formula", &q1],
            "brew search --formula",
        )
        .await
    });
    let c_task = tokio::spawn(async move {
        run_brew_capture(
            &path2,
            &["search", "--cask", &q2],
            "brew search --cask",
        )
        .await
    });

    let (f_res, c_res) = tokio::join!(f_task, c_task);

    let formula_raw = f_res.map_err(|e| BrewError::Internal {
        message: format!("formula search task join: {}", e),
    })??;
    let cask_raw = c_res.map_err(|e| BrewError::Internal {
        message: format!("cask search task join: {}", e),
    })??;

    let installed_set = build_installed_set(&state).await;

    let formulae = parse_search_stdout(&formula_raw)
        .into_iter()
        .map(|name| {
            let installed = installed_set.contains(&name);
            SearchHit {
                installed,
                name,
                kind: PackageKind::Formula,
                description: None,
            }
        })
        .collect();
    let casks = parse_search_stdout(&cask_raw)
        .into_iter()
        .map(|name| {
            let installed = installed_set.contains(&name);
            SearchHit {
                installed,
                name,
                kind: PackageKind::Cask,
                description: None,
            }
        })
        .collect();

    Ok(SearchResults {
        query,
        formulae,
        casks,
        generated_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn brew_search_desc(
    query: String,
    state: State<'_, AppState>,
) -> Result<SearchResults, BrewError> {
    validate_search_query(&query)?;
    let path = state.require_brew_path().await?;

    let raw = run_brew_capture(
        &path,
        &["search", "--desc", &query],
        "brew search --desc",
    )
    .await?;

    let installed_set = build_installed_set(&state).await;

    // `brew search --desc` output: lines of `<name>: <desc>`.
    let mut formulae = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("==>") {
            continue;
        }
        if let Some((name, desc)) = line.split_once(':') {
            let name = name.trim().to_string();
            if name.is_empty() {
                continue;
            }
            let installed = installed_set.contains(&name);
            formulae.push(SearchHit {
                installed,
                name,
                kind: PackageKind::Formula,
                description: Some(desc.trim().to_string()),
            });
        }
    }

    Ok(SearchResults {
        query,
        formulae,
        casks: Vec::new(),
        generated_at: Utc::now().to_rfc3339(),
    })
}

fn validate_search_query(q: &str) -> Result<(), BrewError> {
    if q.trim().is_empty() {
        return Err(BrewError::InvalidArgument {
            message: "search query is empty".into(),
        });
    }
    if q.len() > 200 {
        return Err(BrewError::InvalidArgument {
            message: "search query is too long".into(),
        });
    }
    // Allow most printable chars; brew search accepts regex,
    // but reject leading `-` to prevent flag injection.
    if q.trim_start().starts_with('-') {
        return Err(BrewError::InvalidArgument {
            message: "search query may not start with '-'".into(),
        });
    }
    Ok(())
}

async fn build_installed_set(state: &AppState) -> HashSet<String> {
    let cache = state.installed_cache.read().await;
    let mut set = HashSet::new();
    if let Some(list) = cache.as_ref() {
        for p in list.formulae.iter().chain(list.casks.iter()) {
            set.insert(p.name.clone());
        }
    }
    set
}

// Suppressed: validate_package_name lives in commands::info; we don't
// reuse it here because search queries are not package names.
#[allow(dead_code)]
fn _force_link_validate_package_name() {
    let _ = validate_package_name("noop");
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::validate_search_query;
    use crate::error::BrewError;

    fn err_message(r: Result<(), BrewError>) -> String {
        match r {
            Err(BrewError::InvalidArgument { message }) => message,
            other => panic!("expected InvalidArgument, got {:?}", other),
        }
    }

    // ---------- Happy path ----------

    #[test]
    fn accepts_plain_query() {
        validate_search_query("wget").expect("plain query");
        validate_search_query("python@3").expect("@ ok in query");
        validate_search_query("foo bar").expect("spaces allowed");
        validate_search_query("/regex.*/").expect("regex form allowed");
    }

    #[test]
    fn accepts_query_with_internal_dash() {
        // Internal `-` is fine; only leading `-` is flag-injection territory.
        validate_search_query("foo-bar").expect("internal dash");
        validate_search_query("a-b-c").expect("multi dash");
    }

    // ---------- Empty / oversize ----------

    #[test]
    fn rejects_empty_query() {
        let msg = err_message(validate_search_query(""));
        assert!(msg.contains("empty"), "got {:?}", msg);
    }

    #[test]
    fn rejects_whitespace_only_query() {
        let msg = err_message(validate_search_query("   "));
        assert!(msg.contains("empty"), "got {:?}", msg);
        let msg = err_message(validate_search_query("\t\n"));
        assert!(msg.contains("empty"), "got {:?}", msg);
    }

    #[test]
    fn rejects_oversize_query() {
        let huge = "a".repeat(201);
        let msg = err_message(validate_search_query(&huge));
        assert!(msg.contains("too long"), "got {:?}", msg);
    }

    #[test]
    fn accepts_max_size_query() {
        validate_search_query(&"a".repeat(200)).expect("200 chars allowed");
    }

    // ---------- Flag injection ----------

    #[test]
    fn rejects_leading_dash_query() {
        for s in &["-rm", "--force", "-version", "-"] {
            let msg = err_message(validate_search_query(s));
            assert!(
                msg.contains("may not start with '-'"),
                "input {:?} -> msg {:?}",
                s,
                msg
            );
        }
    }

    #[test]
    fn rejects_leading_dash_with_leading_whitespace() {
        // trim_start().starts_with('-') catches whitespace-prefixed flags.
        let r = validate_search_query("  --force");
        assert!(
            matches!(r, Err(BrewError::InvalidArgument { .. })),
            "whitespace-prefixed flag should be rejected"
        );
    }

    #[test]
    fn allows_internal_dash_after_letter() {
        validate_search_query("a-b").expect("internal dash is fine");
    }
}
