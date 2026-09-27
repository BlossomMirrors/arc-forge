use std::fs;
use std::process::Command;

use anyhow::{Context, Result};

use super::run;
use crate::constants::{BIN_PATH, CONFIG_PATH, HOME_DIR, RUNNER_USER, SERVICE_NAME, UNIT_PATH};

fn unit() -> String {
    format!(
        "[Unit]
Description=Forge build runner
Wants=network-online.target
After=network-online.target
ConditionPathExists={CONFIG_PATH}

[Service]
Type=simple
User={RUNNER_USER}
Group={RUNNER_USER}
WorkingDirectory={HOME_DIR}
Environment=HOME={HOME_DIR}
ExecStart={BIN_PATH} run
Restart=always
RestartSec=5
KillMode=mixed
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
"
    )
}

pub fn install() -> Result<()> {
    fs::write(UNIT_PATH, unit()).with_context(|| format!("Could not write {UNIT_PATH}"))?;
    println!("Wrote systemd unit to {UNIT_PATH}");
    run(Command::new("systemctl").arg("daemon-reload"))?;
    run(Command::new("systemctl").args(["enable", SERVICE_NAME]))?;
    run(Command::new("systemctl").args(["restart", SERVICE_NAME]))?;
    Ok(())
}
