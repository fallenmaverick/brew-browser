//! Canonical brew execution patterns.
//!
//! Two functions:
//! - [`run_brew_capture`] — spawn `brew <args...>`, await completion,
//!   return stdout. Errors map to `BrewExitNonZero` or `Io`.
//! - [`run_brew_streaming`] — spawn `brew <args...>`, line-pump
//!   stdout/stderr into a `Channel<BrewStreamEvent>`, emit lifecycle
//!   events, register the child in the provided jobs map so
//!   `cancel_job` can find it.

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::brew::error_patterns::friendlify;
use crate::error::{truncate_tail, BrewError};
use crate::state::JobHandle;
use crate::types::{BrewStreamEvent, JobResult};

const MAX_STDERR_EXCERPT: usize = 4096;
const MAX_LINE_LEN: usize = 4096;

pub type JobsMap = Arc<Mutex<HashMap<Uuid, JobHandle>>>;

/// Run `brew <args>` and capture stdout. Used for `--json=v2` queries.
///
/// On non-zero exit, returns `BrewError::BrewExitNonZero` with the last
/// ~4 KB of stderr. The `display_command` string is the user-facing form.
/// A directory that is guaranteed to exist and be readable by the
/// invoking user on every supported platform. We set this as the
/// working directory for every `brew` subprocess.
///
/// **Why:** Homebrew refuses to run when its current working directory
/// isn't readable by the user — on Linux it aborts with "The current
/// working directory must be readable to <user> to run brew." A GUI app
/// inherits whatever cwd it was launched from (the app-launcher's cwd,
/// a stale deleted directory, or — when launched oddly — a root-owned
/// path the user can't read). Pinning every spawn to `/` makes the brew
/// invocation independent of how the app happened to be launched. `/`
/// is world-readable on macOS and Linux and always exists.
///
/// Discovered during the v0.6.0 Linux bring-up: launching the app from
/// a directory the user couldn't read made every `brew info` fail with
/// the readable-cwd error, surfacing as "Couldn't load packages."
const BREW_SPAWN_CWD: &str = "/";

pub async fn run_brew_capture(
    brew_path: &Path,
    args: &[&str],
    display_command: &str,
) -> Result<String, BrewError> {
    let mut cmd = Command::new(brew_path);
    cmd.args(args)
        .current_dir(BREW_SPAWN_CWD)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let output = cmd.output().await.map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => BrewError::BrewNotFound,
        _ => BrewError::Io {
            message: format!("failed to spawn brew: {}", e),
        },
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        let excerpt = truncate_tail(stderr.trim_end(), MAX_STDERR_EXCERPT);
        let friendly_message = friendlify(&excerpt, display_command);
        return Err(BrewError::BrewExitNonZero {
            command: display_command.to_string(),
            exit_code: output.status.code().unwrap_or(-1),
            stderr_excerpt: excerpt,
            friendly_message,
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Spawn `brew <args>`, stream stdout/stderr into the provided channel,
/// register the child with the jobs map so it can be canceled.
///
/// Returns the final `JobResult` once the child exits. Emits the full
/// `BrewStreamEvent` lifecycle: `Started` → `Stdout`/`Stderr` → `Exit`
/// or `Canceled`.
///
/// The caller is responsible for holding the write mutex for the
/// duration of the call — this function does not acquire it.
pub async fn run_brew_streaming(
    brew_path: &Path,
    args: Vec<String>,
    display_command: String,
    on_event: Channel<BrewStreamEvent>,
    jobs: JobsMap,
) -> Result<JobResult, BrewError> {
    let job_id = Uuid::new_v4();
    let started_at_chrono = Utc::now();
    let started_at_inst = Instant::now();

    let _ = on_event.send(BrewStreamEvent::Started {
        job_id,
        command: display_command.clone(),
        started_at: started_at_chrono.to_rfc3339(),
    });

    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let mut cmd = Command::new(brew_path);
    cmd.args(&str_args)
        .current_dir(BREW_SPAWN_CWD)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let err = match e.kind() {
                std::io::ErrorKind::NotFound => BrewError::BrewNotFound,
                _ => BrewError::Io {
                    message: format!("failed to spawn brew: {}", e),
                },
            };
            let _ = on_event.send(BrewStreamEvent::Error {
                job_id,
                error: err.clone(),
            });
            return Err(err);
        }
    };

    let child_id = child.id().unwrap_or(0);
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let mut map = jobs.lock().await;
        map.insert(
            job_id,
            JobHandle {
                child_id,
                started_at: started_at_inst,
                cancel_tx: Some(cancel_tx),
            },
        );
    }

    let stdout_chan = on_event.clone();
    let stdout_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let line = clamp_line(line);
                        let _ = stdout_chan.send(BrewStreamEvent::Stdout {
                            job_id,
                            line,
                            ts: Utc::now().to_rfc3339(),
                        });
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    });

    // Bounded ring of recent stderr lines so a non-zero exit can carry a
    // meaningful `stderr_excerpt` even when the caller doesn't subscribe
    // to the Channel (see Wave 3 code review C4).
    let stderr_buf: Arc<Mutex<StderrRing>> = Arc::new(Mutex::new(StderrRing::new(MAX_STDERR_EXCERPT)));
    let stderr_chan = on_event.clone();
    let stderr_buf_writer = Arc::clone(&stderr_buf);
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let line = clamp_line(line);
                        {
                            let mut buf = stderr_buf_writer.lock().await;
                            buf.push(&line);
                        }
                        let _ = stderr_chan.send(BrewStreamEvent::Stderr {
                            job_id,
                            line,
                            ts: Utc::now().to_rfc3339(),
                        });
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    });

    let exit_status = tokio::select! {
        status = child.wait() => status,
        _ = cancel_rx => {
            let _ = child.start_kill();
            match tokio::time::timeout(std::time::Duration::from_secs(5), child.wait()).await {
                Ok(s) => s,
                Err(_) => child.wait().await,
            }
        }
    };

    let _ = tokio::join!(stdout_task, stderr_task);

    let canceled = {
        let mut map = jobs.lock().await;
        let handle = map.remove(&job_id);
        handle.map(|h| h.cancel_tx.is_none()).unwrap_or(false)
    };

    let duration_ms = started_at_inst.elapsed().as_millis() as u64;

    match exit_status {
        Ok(status) => {
            let exit_code = status.code().unwrap_or(-1);
            let success = status.success();

            if canceled {
                let _ = on_event.send(BrewStreamEvent::Canceled { job_id });
                return Err(BrewError::Canceled);
            }

            let _ = on_event.send(BrewStreamEvent::Exit {
                job_id,
                exit_code,
                success,
                duration_ms,
            });

            if success {
                Ok(JobResult {
                    job_id,
                    exit_code,
                    success,
                    duration_ms,
                })
            } else {
                let excerpt = {
                    let buf = stderr_buf.lock().await;
                    buf.snapshot()
                };
                let friendly_message = friendlify(&excerpt, &display_command);
                Err(BrewError::BrewExitNonZero {
                    command: display_command,
                    exit_code,
                    stderr_excerpt: excerpt,
                    friendly_message,
                })
            }
        }
        Err(e) => {
            let err = BrewError::Io {
                message: format!("waiting on brew child failed: {}", e),
            };
            let _ = on_event.send(BrewStreamEvent::Error {
                job_id,
                error: err.clone(),
            });
            Err(err)
        }
    }
}

fn clamp_line(line: String) -> String {
    if line.len() <= MAX_LINE_LEN {
        line
    } else {
        let mut end = MAX_LINE_LEN;
        while end > 0 && !line.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…[truncated]", &line[..end])
    }
}

/// Bounded buffer of recent stderr lines, capped at ~`max_bytes` total.
///
/// On overflow we drop oldest lines until the new line fits, then push.
/// `snapshot()` joins remaining lines with `\n` so the result is suitable
/// for `BrewExitNonZero.stderr_excerpt`. Bounded growth — chatty commands
/// can't OOM the process.
struct StderrRing {
    lines: std::collections::VecDeque<String>,
    cur_bytes: usize,
    max_bytes: usize,
}

impl StderrRing {
    fn new(max_bytes: usize) -> Self {
        Self {
            lines: std::collections::VecDeque::new(),
            cur_bytes: 0,
            max_bytes,
        }
    }

    fn push(&mut self, line: &str) {
        // +1 for the implicit '\n' separator the snapshot will add.
        let cost = line.len().saturating_add(1);
        // If a single line is larger than the cap, store just its tail.
        if cost > self.max_bytes {
            self.lines.clear();
            self.cur_bytes = 0;
            // Walk forward to a char boundary so we don't slice mid-UTF-8.
            let mut start = line.len().saturating_sub(self.max_bytes.saturating_sub(1));
            while start < line.len() && !line.is_char_boundary(start) {
                start += 1;
            }
            let tail = line[start..].to_string();
            self.cur_bytes = tail.len().saturating_add(1);
            self.lines.push_back(tail);
            return;
        }
        while self.cur_bytes + cost > self.max_bytes {
            match self.lines.pop_front() {
                Some(dropped) => {
                    self.cur_bytes = self
                        .cur_bytes
                        .saturating_sub(dropped.len().saturating_add(1));
                }
                None => break,
            }
        }
        self.cur_bytes = self.cur_bytes.saturating_add(cost);
        self.lines.push_back(line.to_string());
    }

    fn snapshot(&self) -> String {
        self.lines
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    }
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stderr_ring_keeps_lines_under_cap() {
        let mut r = StderrRing::new(100);
        r.push("first");
        r.push("second");
        let s = r.snapshot();
        assert_eq!(s, "first\nsecond");
    }

    #[test]
    fn stderr_ring_drops_oldest_when_full() {
        // Cap is just enough to hold ~2 short lines.
        let mut r = StderrRing::new(16);
        r.push("aaaaa"); // 5 + 1 = 6
        r.push("bbbbb"); // 5 + 1 = 6, total 12
        r.push("ccccc"); // would push to 18 > 16, drop "aaaaa"
        let s = r.snapshot();
        assert!(!s.contains("aaaaa"), "oldest line should be dropped, got {s:?}");
        assert!(s.contains("bbbbb"));
        assert!(s.contains("ccccc"));
    }

    #[test]
    fn stderr_ring_truncates_oversized_single_line() {
        let mut r = StderrRing::new(8);
        let huge = "x".repeat(100);
        r.push(&huge);
        let s = r.snapshot();
        // Result is bounded by the cap (allowing the +1 separator slop).
        assert!(s.len() <= 8, "snapshot {} bytes exceeds cap", s.len());
        // And we kept the tail of the huge line.
        assert!(s.chars().all(|c| c == 'x'));
    }

    #[test]
    fn stderr_ring_empty_snapshot_is_empty_string() {
        let r = StderrRing::new(64);
        assert_eq!(r.snapshot(), "");
    }

    #[test]
    fn stderr_ring_handles_utf8_boundary_on_truncate() {
        // Each "日" is 3 bytes. With cap 8, an oversize line gets its
        // tail kept, walking to a valid char boundary.
        let mut r = StderrRing::new(8);
        let s = "日本語日本語"; // 18 bytes
        r.push(s);
        let snap = r.snapshot();
        // Must be valid UTF-8 (no panic from above) and bounded.
        assert!(snap.len() <= 8);
        // The kept tail must end with one of the source chars.
        assert!(s.ends_with(&snap) || snap.is_empty());
    }
}
