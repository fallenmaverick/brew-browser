//! `brew services` integration — list / start / stop / restart background
//! services managed by launchd via Homebrew.
//!
//! - `services_list()` runs `brew services list --json` and returns a typed
//!   `Vec<Service>`. Cached on `AppState` with a short TTL (5 s) so the
//!   Services tab feels instant between refreshes.
//! - `services_start(name)`, `services_stop(name)`, `services_restart(name)`
//!   each shell out to the corresponding brew subcommand and invalidate the
//!   cache so the next list call sees the new state. Each takes the brew
//!   write-lock since launchctl changes are a state mutation.
//!
//! Status values from brew (observed): "started", "stopped", "none", "error",
//! "scheduled", "unknown". We pass the raw string through; the frontend's
//! `ServiceStatus` union maps known values to UI states and falls back to
//! "unknown" for anything else.

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::brew::exec::run_brew_capture;
use crate::error::BrewError;
use crate::state::AppState;

const SERVICES_CACHE_TTL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub name: String,
    pub status: String,
    pub user: Option<String>,
    pub file: Option<String>,
    /// Present when status == "error"; the exit code of the failed launch.
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct CachedServices {
    pub services: Arc<Vec<Service>>,
    pub fetched_at: Instant,
}

async fn fetch_services_list(brew: &std::path::Path) -> Result<Vec<Service>, BrewError> {
    let out = run_brew_capture(brew, &["services", "list", "--json"], "brew services list").await?;
    let services: Vec<Service> = serde_json::from_str(&out).map_err(|e| BrewError::JsonParse {
        command: "brew services list --json".to_string(),
        message: format!("services list: {e}"),
        raw_excerpt: out.chars().take(400).collect(),
    })?;
    Ok(services)
}

#[tauri::command]
pub async fn services_list(state: State<'_, AppState>) -> Result<Arc<Vec<Service>>, BrewError> {
    {
        let cache = state.services_cache.lock().await;
        if let Some(cached) = cache.as_ref() {
            if cached.fetched_at.elapsed() < SERVICES_CACHE_TTL {
                return Ok(Arc::clone(&cached.services));
            }
        }
    }
    let brew = state.require_brew_path().await?;
    let services = fetch_services_list(&brew).await?;
    let arc = Arc::new(services);
    let mut cache = state.services_cache.lock().await;
    *cache = Some(CachedServices {
        services: Arc::clone(&arc),
        fetched_at: Instant::now(),
    });
    Ok(arc)
}

/// Force the next `services_list` call to re-shell `brew services list`.
#[tauri::command]
pub async fn services_clear_cache(state: State<'_, AppState>) -> Result<(), BrewError> {
    let mut cache = state.services_cache.lock().await;
    *cache = None;
    Ok(())
}

/// Validate a service name before passing it to `brew services <verb>`. Brew
/// formula names are lowercase alphanumeric with `-`, `_`, `+`, `@`, `.`; we
/// reject anything else as defense-in-depth against shell-meta injection even
/// though Command::new + .arg() is already argv-safe.
fn validate_service_name(name: &str) -> Result<(), BrewError> {
    if name.is_empty() || name.len() > 128 {
        return Err(BrewError::InvalidArgument {
            message: format!("invalid service name length: {}", name.len()),
        });
    }
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '+' | '@' | '.'));
    if !ok {
        return Err(BrewError::InvalidArgument {
            message: format!("invalid character(s) in service name: {name}"),
        });
    }
    Ok(())
}

async fn run_service_verb(
    state: &State<'_, AppState>,
    verb: &str,
    name: &str,
) -> Result<(), BrewError> {
    validate_service_name(name)?;
    let brew = state.require_brew_path().await?;
    // Take the write lock — launchctl state changes are mutations.
    let _guard = state.brew_write_lock.lock().await;
    let context = format!("brew services {verb} {name}");
    run_brew_capture(&brew, &["services", verb, name], &context).await?;
    drop(_guard);
    // Invalidate the services cache so the next list shows the new state.
    let mut cache = state.services_cache.lock().await;
    *cache = None;
    Ok(())
}

#[tauri::command]
pub async fn services_start(name: String, state: State<'_, AppState>) -> Result<(), BrewError> {
    run_service_verb(&state, "start", &name).await
}

#[tauri::command]
pub async fn services_stop(name: String, state: State<'_, AppState>) -> Result<(), BrewError> {
    run_service_verb(&state, "stop", &name).await
}

#[tauri::command]
pub async fn services_restart(name: String, state: State<'_, AppState>) -> Result<(), BrewError> {
    run_service_verb(&state, "restart", &name).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_service_name_accepts_common_formats() {
        assert!(validate_service_name("postgresql").is_ok());
        assert!(validate_service_name("postgresql@14").is_ok());
        assert!(validate_service_name("redis-stack").is_ok());
        assert!(validate_service_name("dbus").is_ok());
        assert!(validate_service_name("homebrew.mxcl.nginx").is_ok());
    }

    #[test]
    fn validate_service_name_rejects_shell_meta() {
        assert!(validate_service_name("nginx; rm -rf /").is_err());
        assert!(validate_service_name("nginx`whoami`").is_err());
        assert!(validate_service_name("$(uname)").is_err());
        assert!(validate_service_name("nginx|cat").is_err());
        assert!(validate_service_name("").is_err());
    }

    #[test]
    fn validate_service_name_rejects_overlong_input() {
        let too_long = "a".repeat(129);
        assert!(validate_service_name(&too_long).is_err());
    }
}
