use std::path::Path;
use std::process::Command;

use anyhow::{bail, Result};

use super::run;

const COMMON: &[&str] = &[
    "git",
    "flatpak",
    "flatpak-builder",
    "ostree",
    "patch",
    "unzip",
    "bzip2",
    "curl",
    "tar",
];

const DNF_EXTRA: &[&str] = &["elfutils", "xz", "ca-certificates"];
const APT_EXTRA: &[&str] = &["elfutils", "xz-utils", "ca-certificates"];

pub fn install() -> Result<()> {
    if Path::new("/usr/bin/dnf").exists() {
        println!("Installing build dependencies with dnf");
        run(Command::new("dnf")
            .args(["install", "-y"])
            .args(COMMON)
            .args(DNF_EXTRA))
    } else if Path::new("/usr/bin/apt-get").exists() {
        println!("Installing build dependencies with apt");
        run(Command::new("apt-get").arg("update"))?;
        run(Command::new("apt-get")
            .env("DEBIAN_FRONTEND", "noninteractive")
            .args(["install", "-y"])
            .args(COMMON)
            .args(APT_EXTRA))
    } else {
        bail!("Unsupported distribution: neither dnf nor apt-get was found")
    }
}
