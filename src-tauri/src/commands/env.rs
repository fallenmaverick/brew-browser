//! `brew_doctor` — startup probe for the brew CLI.

use tauri::State;

use crate::brew::exec::run_brew_capture;
use crate::error::BrewError;
use crate::state::AppState;
use crate::types::BrewEnvironment;

#[tauri::command]
pub async fn brew_doctor(state: State<'_, AppState>) -> Result<BrewEnvironment, BrewError> {
    let path = match state.brew_path.read().await.clone() {
        Some(p) => p,
        None => {
            return Ok(BrewEnvironment {
                installed: false,
                version: None,
                prefix: None,
                path_used: None,
            });
        }
    };

    let version_out = run_brew_capture(&path, &["--version"], "brew --version")
        .await
        .ok();
    let version = version_out.and_then(|s| {
        // First line, format: "Homebrew 5.1.13"
        s.lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1).map(|v| v.to_string()))
    });

    let prefix = run_brew_capture(&path, &["--prefix"], "brew --prefix")
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let env = BrewEnvironment {
        installed: true,
        version,
        prefix,
        path_used: Some(path.to_string_lossy().into_owned()),
    };

    {
        let mut cached = state.brew_env.write().await;
        *cached = env.clone();
    }

    Ok(env)
}
