//! Tauri command surface. One sub-module per cluster of related commands.
//!
//! `lib.rs` re-exports these via `commands::*` and registers them in
//! `tauri::generate_handler![]`.

pub mod actions;
pub mod brewfile;
pub mod cask_icon;
pub mod cask_icon_homepage;
pub mod env;
pub mod info;
pub mod list;
pub mod search;
pub mod trending;

// Re-export every command in flat form so `invoke_handler!` can take them.
pub use actions::*;
pub use brewfile::*;
pub use cask_icon::*;
pub use cask_icon_homepage::*;
pub use env::*;
pub use info::*;
pub use list::*;
pub use search::*;
pub use trending::*;
