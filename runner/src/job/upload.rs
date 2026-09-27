use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};

use super::logstream::LogSink;
use crate::api::{with_retry, ApiError, Client};
use crate::constants::UPLOAD_CHUNK_BYTES;
use crate::registry::JobHandle;

pub struct Artifact {
    pub path: PathBuf,
    pub size: u64,
    pub sha256: String,
}

pub fn digest(path: &Path) -> Result<Artifact> {
    let mut file = File::open(path).with_context(|| format!("Could not open {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    Ok(Artifact {
        path: path.to_path_buf(),
        size,
        sha256: hex::encode(hasher.finalize()),
    })
}

fn read_chunk(path: &Path, offset: u64) -> Result<Vec<u8>> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut chunk = Vec::with_capacity(UPLOAD_CHUNK_BYTES);
    file.take(UPLOAD_CHUNK_BYTES as u64).read_to_end(&mut chunk)?;
    Ok(chunk)
}

pub async fn upload(
    client: &Client,
    handle: &JobHandle,
    log: &LogSink,
    job_id: &str,
    artifact: &Artifact,
) -> Result<()> {
    let mut offset = with_retry("Artifact size", || client.artifact_size(job_id)).await?;
    let mut last_percent = u64::MAX;

    while offset < artifact.size {
        if handle.is_cancelled() {
            bail!("job was cancelled");
        }
        let chunk = read_chunk(&artifact.path, offset)?;
        let result = with_retry("Artifact upload", || {
            client.put_artifact_chunk(job_id, offset, chunk.clone())
        })
        .await;
        offset = match result {
            Ok(size) => size,
            Err(ApiError::Conflict(size)) => size,
            Err(ApiError::Gone) => {
                handle.cancel();
                bail!("job was cancelled");
            }
            Err(e) => return Err(e.into()),
        };

        let percent = offset * 100 / artifact.size.max(1);
        if percent / 10 != last_percent / 10 {
            last_percent = percent;
            log.line(format!("Uploaded {percent}% of {} bytes", artifact.size));
        }
    }
    Ok(())
}
