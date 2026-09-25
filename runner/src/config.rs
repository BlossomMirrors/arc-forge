use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use json_comments::StripComments;
use serde::{Deserialize, Serialize};

use crate::constants::DEFAULT_WORK_DIR;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub token: String,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
    #[serde(default = "default_work_dir")]
    pub work_dir: PathBuf,
}

fn default_concurrency() -> usize {
    1
}

fn default_work_dir() -> PathBuf {
    PathBuf::from(DEFAULT_WORK_DIR)
}

impl Config {
    pub fn new(token: String) -> Self {
        Self {
            token,
            concurrency: default_concurrency(),
            work_dir: default_work_dir(),
        }
    }

    pub fn load(path: &Path) -> Result<Self> {
        let raw = fs::read(path).with_context(|| format!("Could not read {}", path.display()))?;
        let config: Config = serde_json::from_reader(StripComments::new(raw.as_slice()))
            .with_context(|| format!("Could not parse {}", path.display()))?;
        Ok(Config {
            concurrency: config.concurrency.max(1),
            ..config
        })
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let body = serde_json::to_string_pretty(self)?;
        fs::write(path, format!("{body}\n"))
            .with_context(|| format!("Could not write {}", path.display()))
    }
}
