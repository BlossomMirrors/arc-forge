use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use anyhow::{Context, Result};
use nix::unistd::{chown, Uid};

use super::user::{owned_dir, Account};
use crate::config::Config;
use crate::constants::{BIN_DIR, BIN_PATH, CONFIG_PATH, HOME_DIR};

pub fn install_binary(account: &Account) -> Result<()> {
    owned_dir(Path::new(HOME_DIR), account)?;
    owned_dir(Path::new(BIN_DIR), account)?;

    let current = std::env::current_exe().context("Could not locate the running binary")?;
    let target = Path::new(BIN_PATH);
    if current != target {
        let staged = target.with_extension("new");
        fs::copy(&current, &staged)
            .with_context(|| format!("Could not copy the runner to {}", staged.display()))?;
        fs::rename(&staged, target)?;
    }
    fs::set_permissions(target, fs::Permissions::from_mode(0o755))?;
    chown(target, Some(account.uid), Some(account.gid))?;
    println!("Installed runner binary to {BIN_PATH}");
    Ok(())
}

pub fn write_config(token: &str, concurrency: Option<usize>, account: &Account) -> Result<Config> {
    let path = Path::new(CONFIG_PATH);
    let mut config = if path.exists() {
        Config::load(path).unwrap_or_else(|_| Config::new(token.to_string()))
    } else {
        Config::new(token.to_string())
    };
    config.token = token.to_string();
    if let Some(concurrency) = concurrency {
        config.concurrency = concurrency.max(1);
    }

    config.save(path)?;
    chown(path, Some(Uid::from_raw(0)), Some(account.gid))?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o640))?;
    owned_dir(&config.work_dir, account)?;
    println!("Wrote configuration to {CONFIG_PATH}");
    Ok(config)
}
