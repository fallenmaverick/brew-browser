//! brew-browser — Tauri 2 backend entrypoint.
//!
//! Module layout per `memory-bank/backendApi.md` §9. This file is the
//! Tauri Builder + invoke_handler registration; every command lives
//! in `commands::*`.

mod brew;
mod commands;
mod error;
mod state;
mod trending;
mod types;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Best-effort tracing setup — silent if RUST_LOG is unset.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn,brew_browser_lib=info")),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            state::initialize(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            brew_doctor,
            brew_list,
            brew_outdated,
            brew_info,
            brew_search,
            brew_search_desc,
            brew_install,
            brew_uninstall,
            brew_upgrade,
            brew_update,
            cancel_job,
            brewfile_dump,
            brewfile_install,
            brewfile_check,
            brewfile_list,
            brewfile_read,
            brewfile_delete,
            brewfile_export,
            brewfile_import,
            trending_fetch,
            trending_clear_cache,
            cask_icon,
            cask_icon_from_homepage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
