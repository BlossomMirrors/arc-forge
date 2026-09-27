use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};
use nix::unistd::{chown, Gid, Uid, User};

use super::run;
use crate::constants::{HOME_DIR, RUNNER_USER};

pub struct Account {
    pub uid: Uid,
    pub gid: Gid,
}

fn lookup() -> Result<Option<Account>> {
    Ok(User::from_name(RUNNER_USER)?.map(|u| Account {
        uid: u.uid,
        gid: u.gid,
    }))
}

pub fn ensure() -> Result<Account> {
    if lookup()?.is_none() {
        println!("Creating system user {RUNNER_USER}");
        let shell = if Path::new("/usr/sbin/nologin").exists() {
            "/usr/sbin/nologin"
        } else {
            "/sbin/nologin"
        };
        run(Command::new("useradd").args([
            "--system",
            "--create-home",
            "--home-dir",
            HOME_DIR,
            "--shell",
            shell,
            RUNNER_USER,
        ]))?;
    }
    lookup()?.context("The runner user could not be created")
}

pub fn owned_dir(path: &Path, account: &Account) -> Result<()> {
    fs::create_dir_all(path).with_context(|| format!("Could not create {}", path.display()))?;
    chown(path, Some(account.uid), Some(account.gid))
        .with_context(|| format!("Could not change owner of {}", path.display()))?;
    Ok(())
}
