//! Locate the `brew` binary.

use std::path::PathBuf;

/// Resolve the path to the `brew` binary by checking the known prefixes
/// (Apple Silicon first, then Intel), then falling back to a PATH lookup.
///
/// Returns `None` if brew can't be located. Callers should map this to
/// `BrewError::BrewNotFound`.
pub fn resolve_brew_path() -> Option<PathBuf> {
    // Apple Silicon default
    let arm = PathBuf::from("/opt/homebrew/bin/brew");
    if arm.is_file() {
        return Some(arm);
    }
    // Intel default
    let intel = PathBuf::from("/usr/local/bin/brew");
    if intel.is_file() {
        return Some(intel);
    }
    // PATH fallback
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join("brew");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    /// On the dev host (Beast), brew should always resolve. Skipped if not.
    #[test]
    fn resolve_brew_path_on_dev_host_returns_some() {
        match resolve_brew_path() {
            Some(p) => {
                assert!(
                    p.ends_with("brew"),
                    "resolved path should end with `brew`, got {}",
                    p.display()
                );
                assert!(p.is_file(), "resolved path must be a file: {}", p.display());
            }
            None => {
                // CI without brew: tolerable but warn.
                eprintln!("brew not installed; skipping resolve_brew_path positive test");
            }
        }
    }

    #[test]
    fn resolve_brew_path_prefers_apple_silicon_when_present() {
        // We can't override the filesystem in unit tests, but if running
        // on Apple Silicon (and brew is installed at /opt/homebrew), the
        // resolver must return that path verbatim.
        let arm = std::path::PathBuf::from("/opt/homebrew/bin/brew");
        if arm.is_file() {
            assert_eq!(
                resolve_brew_path().as_deref(),
                Some(arm.as_path()),
                "must prefer /opt/homebrew/bin/brew over PATH lookup"
            );
        }
    }
}
