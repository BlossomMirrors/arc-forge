mod files;
mod packages;
mod systemd;
mod user;

use std::process::Command;

use anyhow::{bail, Context, Result};
use nix::unistd::geteuid;

use crate::api::{ApiError, Client};
use crate::constants::{FORGE_URL, SERVICE_NAME};
use crate::heartbeat;

pub(crate) fn run(command: &mut Command) -> Result<()> {
    let status = command
        .status()
        .with_context(|| format!("Could not run {:?}", command.get_program()))?;
    if !status.success() {
        bail!("{:?} exited with {status}", command.get_program());
    }
    Ok(())
}

async fn validate_token(token: &str, concurrency: usize) -> Result<()> {
    let client = Client::new(token.to_string())?;
    match client.heartbeat(&heartbeat::request(concurrency, Vec::new())).await {
        Ok(_) => Ok(()),
        Err(ApiError::Unauthorized) => bail!("The token was rejected by {FORGE_URL}"),
        Err(e) => bail!("Could not reach {FORGE_URL}: {e}"),
    }
}

pub async fn install(token: String, concurrency: Option<usize>) -> Result<()> {
    if !geteuid().is_root() {
        bail!("The installer must run as root");
    }

    println!("Checking the token with {FORGE_URL}");
    validate_token(&token, concurrency.unwrap_or(1)).await?;

    packages::install()?;
    let account = user::ensure()?;
    files::install_binary(&account)?;
    let config = files::write_config(&token, concurrency, &account)?;
    systemd::install()?;

    println!(
        "Forge runner is running with {} concurrent job(s). Follow it with: journalctl -fu {SERVICE_NAME}",
        config.concurrency
    );
    Ok(())
}
