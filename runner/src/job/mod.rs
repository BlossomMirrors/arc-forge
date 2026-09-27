mod build;
mod extract;
mod logstream;
mod process;
mod upload;

use std::fs;
use std::path::Path;
use std::sync::Arc;

use anyhow::Result;

use crate::api::types::{CompleteRequest, Job};
use crate::api::{with_retry, ApiError, Client};
use crate::args;
use crate::constants::VERSION;
use crate::registry::JobHandle;
use crate::system;
use logstream::{LogSink, LogStream};
use process::Step;

async fn execute(
    client: &Client,
    handle: &JobHandle,
    log: &LogSink,
    work_dir: &Path,
    job: &Job,
) -> Result<CompleteRequest> {
    let dir = work_dir.join("jobs").join(&job.id);
    let cache_dir = work_dir
        .join("cache")
        .join(format!("{}-{}", job.appid, job.arch));
    fs::create_dir_all(&dir)?;
    fs::create_dir_all(&cache_dir)?;

    let step = Step {
        handle,
        log,
        cwd: &dir,
    };

    let output = build::build(&step, job, &dir, &cache_dir).await?;
    let appstream = extract::extract(&step, &job.appid, &output.main_ref, &dir).await?;

    let archive = dir.join("repo.tar");
    step.run(
        "tar",
        &args![
            "-C",
            dir.join("local-repo").display(),
            "-cf",
            archive.display(),
            "."
        ],
    )
    .await?;
    let artifact = upload::digest(&archive)?;
    log.line(format!(
        "Uploading {} bytes (sha256 {})",
        artifact.size, artifact.sha256
    ));
    upload::upload(client, handle, log, &job.id, &artifact).await?;
    log.line("Upload finished, the Forge will sign and publish the build");

    Ok(CompleteRequest {
        success: true,
        git_commit: Some(output.git_commit),
        metainfo_b64: appstream.metainfo_b64,
        icon_b64: appstream.icon_b64,
        refs: output.refs,
        sha256: Some(artifact.sha256),
        size: Some(artifact.size),
        ..Default::default()
    })
}

pub async fn run(client: &Arc<Client>, handle: &JobHandle, work_dir: &Path, job: &Job) {
    let stream = LogStream::start(client.clone(), handle.clone(), job.id.clone());
    let log = stream.sink();
    log.line(format!(
        "Forge runner {VERSION} on {} ({}), building {} for {}",
        system::hostname(),
        system::os_name(),
        job.appid,
        job.arch
    ));

    let result = execute(client, handle, &log, work_dir, job).await;
    let body = match result {
        Ok(body) => body,
        Err(e) => {
            log.line(format!("Job failed: {e:#}"));
            CompleteRequest {
                success: false,
                error: Some(format!("{e:#}")),
                ..Default::default()
            }
        }
    };
    drop(log);
    stream.finish().await;

    let _ = fs::remove_dir_all(work_dir.join("jobs").join(&job.id));

    if handle.is_cancelled() {
        return;
    }
    match with_retry("Job completion", || client.complete(&job.id, &body)).await {
        Ok(()) | Err(ApiError::Gone) => {}
        Err(e) => eprintln!("Could not report the result of job {}: {e}", job.id),
    }
}
