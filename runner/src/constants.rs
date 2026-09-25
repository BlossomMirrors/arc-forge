use std::time::Duration;

pub const FORGE_URL: &str = "https://forge.arcstore.net";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub const CONFIG_PATH: &str = "/etc/forge-runner.jsonc";
pub const UNIT_PATH: &str = "/etc/systemd/system/forge-runner.service";
pub const SERVICE_NAME: &str = "forge-runner";
pub const RUNNER_USER: &str = "forge-runner";
pub const HOME_DIR: &str = "/var/lib/forge-runner";
pub const BIN_DIR: &str = "/var/lib/forge-runner/bin";
pub const BIN_PATH: &str = "/var/lib/forge-runner/bin/forge-runner";
pub const DEFAULT_WORK_DIR: &str = "/var/lib/forge-runner/work";

pub const FLATHUB_REPO_URL: &str = "https://dl.flathub.org/repo/flathub.flatpakrepo";

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
pub const REVOKED_INTERVAL: Duration = Duration::from_secs(60);
pub const LOG_FLUSH_INTERVAL: Duration = Duration::from_secs(3);
pub const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(10);
pub const JOB_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
pub const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
pub const UPLOAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(600);
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
pub const WORKER_ERROR_BACKOFF: Duration = Duration::from_secs(10);

pub const UPLOAD_CHUNK_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_PENDING_LOG_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_RETRIES: u32 = 12;
