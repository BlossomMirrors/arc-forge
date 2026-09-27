use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};

use crate::api::types::UpdateInfo;
use crate::api::Client;
use crate::constants::{UPDATE_CHECK_INTERVAL, VERSION};
use crate::registry::State;
use crate::system;

async fn install_update(client: &Client, update: &UpdateInfo) -> Result<()> {
    let binary = client.download_binary(system::arch()).await?;
    let digest = hex::encode(Sha256::digest(&binary));
    if !digest.eq_ignore_ascii_case(&update.sha256) {
        bail!("checksum mismatch, expected {} but got {digest}", update.sha256);
    }

    let current = std::env::current_exe().context("Could not locate the running binary")?;
    let staged = current.with_extension("new");
    fs::write(&staged, &binary).with_context(|| format!("Could not write {}", staged.display()))?;
    fs::set_permissions(&staged, fs::Permissions::from_mode(0o755))?;
    fs::rename(&staged, &current)
        .with_context(|| format!("Could not replace {}", current.display()))?;
    Ok(())
}

pub async fn run(client: Arc<Client>, state: Arc<State>) {
    loop {
        tokio::time::sleep(UPDATE_CHECK_INTERVAL).await;

        let Some(update) = state.pending_update() else {
            continue;
        };
        if update.version == VERSION {
            continue;
        }

        if !state.is_draining() {
            eprintln!(
                "Version {} is available, finishing running jobs before updating",
                update.version
            );
            state.set_draining(true);
        }
        if state.running_count() > 0 {
            continue;
        }

        match install_update(&client, &update).await {
            Ok(()) => {
                eprintln!("Updated to version {}, restarting", update.version);
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("Update to {} failed: {e:#}", update.version);
                state.mark_update_failed(&update.sha256);
            }
        }
    }
}
