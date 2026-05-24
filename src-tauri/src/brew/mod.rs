//! Low-level brew interaction primitives.
//!
//! - `exec`: the two canonical patterns for running `brew` — capture-stdout
//!   for `--json=v2` calls, and streaming for long-running install/upgrade.
//! - `parse`: serde mirrors of `brew --json=v2` shapes + conversion to our
//!   frontend-facing DTOs.
//! - `paths`: locate the `brew` binary on PATH.

pub mod error_patterns;
pub mod exec;
pub mod parse;
pub mod paths;
