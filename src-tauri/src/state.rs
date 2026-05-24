//! Tauri-managed application state.
//!
//! - `brew_path` is detected once at startup.
//! - `brew_write_lock` serializes every WRITE invocation of `brew`.
//!   Reads bypass it (per `decisions.md` and `backendApi.md` §5).
//! - `jobs` tracks in-flight streaming children so `cancel_job` can find them.
//! - `trending_cache` is a small per-window TTL cache for `formulae.brew.sh`.
//! - `installed_cache` is invalidated after every WRITE so the next
//!   `brew_list` reflects reality.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::{oneshot, Mutex, RwLock};
use uuid::Uuid;

use crate::brew::paths::resolve_brew_path;
use crate::commands::categories::CategoriesData;
use crate::commands::disk_usage::CachedDiskUsage;
use crate::commands::services::CachedServices;
use crate::error::BrewError;
use crate::trending::cache::TrendingCache;
use crate::types::{BrewEnvironment, PackageList};

/// Per-job handle stored in `AppState.jobs`. The streaming task holds
/// the actual `Child`; this struct holds enough to identify and cancel it.
pub struct JobHandle {
    /// PID of the spawned brew child. Surfaced for diagnostics
    /// (currently consumed only by future "show pid in console" features).
    #[allow(dead_code)]
    pub child_id: u32,
    /// Wall-clock instant the job began. Used for "elapsed" displays
    /// in future drawer headers.
    #[allow(dead_code)]
    pub started_at: Instant,
    /// Sender used to ask the streaming task to kill its child.
    /// `take()`-d on first cancel so subsequent calls are a no-op.
    pub cancel_tx: Option<oneshot::Sender<()>>,
}

/// Shared application state. Registered via `Builder::manage()`.
pub struct AppState {
    /// Path to the resolved `brew` binary. `None` if brew wasn't found
    /// at startup — commands consult this and return `BrewError::BrewNotFound`.
    pub brew_path: RwLock<Option<PathBuf>>,

    /// Cached brew environment (version, prefix).
    pub brew_env: RwLock<BrewEnvironment>,

    /// Single coarse write lock. Held for the duration of any
    /// state-mutating brew invocation. Trade-off accepted: at UI scale
    /// (one user, one window) the queueing is invisible.
    pub brew_write_lock: Arc<Mutex<()>>,

    /// In-flight streaming jobs, keyed by job_id.
    pub jobs: Arc<Mutex<HashMap<Uuid, JobHandle>>>,

    /// Trending analytics cache (per-window TTL).
    pub trending_cache: Arc<Mutex<TrendingCache>>,

    /// Resolved app-data directory for Brewfiles.
    pub brewfiles_dir: PathBuf,

    /// Resolved app-data root for caches (icons, etc.).
    /// Currently: `~/Library/Application Support/brew-browser/`.
    /// `cask_icon` writes converted PNGs to `<cache_dir>/icons/<token>.png`.
    pub cache_dir: PathBuf,

    /// Resolved app-data root — the OS-canonical
    /// `~/Library/Application Support/brew-browser/` directory that owns
    /// both `cache_dir` and `brewfiles_dir`. Surfaced separately from
    /// `cache_dir` (even though today they happen to be the same path)
    /// so the security gates that check "is this path inside our app
    /// data dir?" stay correct if either subdir is relocated later.
    /// Used by the brewfile import/export sandbox checks
    /// (`is_safe_export_target`).
    pub app_data_dir: PathBuf,

    /// Cached package list for cross-referencing (e.g. trending
    /// "installed" flag). Invalidated after every WRITE.
    pub installed_cache: RwLock<Option<PackageList>>,

    /// Parsed `categories.json` payload, memoised across calls. Filled lazily
    /// on the first `categories_data` invocation. The JSON itself is baked
    /// into the binary via `include_str!`, so this is purely a parse cache.
    pub categories_cache: Arc<Mutex<Option<Arc<CategoriesData>>>>,

    /// Disk-usage report cache. Filled by `disk_usage`, invalidated by
    /// `disk_usage_clear_cache`. TTL is checked inside the command itself
    /// (60 s) so concurrent callers don't double-spawn `du` on each other.
    pub disk_usage_cache: Arc<Mutex<Option<CachedDiskUsage>>>,

    /// `brew services list` result, memoised for ~5 s so the Services tab
    /// renders instantly after the first probe. Invalidated automatically
    /// by start/stop/restart so post-action lists are fresh.
    pub services_cache: Arc<Mutex<Option<CachedServices>>>,
}

impl AppState {
    /// Build the state at startup. Resolves `brew`, creates the
    /// brewfiles directory, and primes caches.
    pub fn build() -> Result<Self, BrewError> {
        let brew_path = resolve_brew_path();
        let brewfiles_dir = resolve_brewfiles_dir()?;
        if !brewfiles_dir.exists() {
            std::fs::create_dir_all(&brewfiles_dir).map_err(|e| BrewError::Io {
                message: format!(
                    "could not create brewfiles dir {}: {}",
                    brewfiles_dir.display(),
                    e
                ),
            })?;
        }
        let cache_dir = resolve_cache_dir()?;
        if !cache_dir.exists() {
            std::fs::create_dir_all(&cache_dir).map_err(|e| BrewError::Io {
                message: format!(
                    "could not create cache dir {}: {}",
                    cache_dir.display(),
                    e
                ),
            })?;
        }
        let app_data_dir = resolve_app_data_dir()?;

        Ok(Self {
            brew_path: RwLock::new(brew_path),
            brew_env: RwLock::new(BrewEnvironment::default()),
            brew_write_lock: Arc::new(Mutex::new(())),
            jobs: Arc::new(Mutex::new(HashMap::new())),
            trending_cache: Arc::new(Mutex::new(TrendingCache::default())),
            brewfiles_dir,
            cache_dir,
            app_data_dir,
            installed_cache: RwLock::new(None),
            categories_cache: Arc::new(Mutex::new(None)),
            disk_usage_cache: Arc::new(Mutex::new(None)),
            services_cache: Arc::new(Mutex::new(None)),
        })
    }

    /// Invalidate caches that depend on filesystem / brew state.
    /// Call after every successful WRITE.
    pub async fn invalidate_caches(&self) {
        let mut cache = self.installed_cache.write().await;
        *cache = None;
    }

    /// Return the resolved brew binary path, or BrewNotFound.
    pub async fn require_brew_path(&self) -> Result<PathBuf, BrewError> {
        self.brew_path
            .read()
            .await
            .clone()
            .ok_or(BrewError::BrewNotFound)
    }
}

/// Resolve `~/Library/Application Support/brew-browser/brewfiles/`.
fn resolve_brewfiles_dir() -> Result<PathBuf, BrewError> {
    let mut base = dirs::data_dir().ok_or_else(|| BrewError::Internal {
        message: "could not resolve OS data dir".into(),
    })?;
    base.push("brew-browser");
    base.push("brewfiles");
    Ok(base)
}

/// Resolve `~/Library/Application Support/brew-browser/` for caches
/// (icons, etc.). The `cask_icon` command writes converted PNGs to
/// `<cache_dir>/icons/<token>.png`.
fn resolve_cache_dir() -> Result<PathBuf, BrewError> {
    let mut base = dirs::data_dir().ok_or_else(|| BrewError::Internal {
        message: "could not resolve OS data dir".into(),
    })?;
    base.push("brew-browser");
    Ok(base)
}

/// Resolve the canonical app-data root for security gates:
/// `~/Library/Application Support/brew-browser/`. Used by the brewfile
/// import/export sandbox checks to refuse writes anywhere inside our own
/// state directory.
fn resolve_app_data_dir() -> Result<PathBuf, BrewError> {
    let mut base = dirs::data_dir().ok_or_else(|| BrewError::Internal {
        message: "could not resolve OS data dir".into(),
    })?;
    base.push("brew-browser");
    Ok(base)
}

/// Tauri setup hook — instantiates and manages `AppState`.
pub fn initialize<R: tauri::Runtime>(
    app: &mut tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    let state = AppState::build()?;
    app.manage(state);
    Ok(())
}
