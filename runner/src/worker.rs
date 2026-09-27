use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use crate::api::{ApiError, Client};
use crate::constants::WORKER_ERROR_BACKOFF;
use crate::job;
use crate::registry::State;
use crate::system;

pub async fn run(index: usize, client: Arc<Client>, state: Arc<State>, work_dir: PathBuf) {
    loop {
        if state.is_draining() || state.is_revoked() {
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        }

        match client.request_job(system::arch()).await {
            Ok(Some(job)) => {
                eprintln!("Worker {index} picked up job {} ({} {})", job.id, job.appid, job.arch);
                let handle = state.register(&job.id);
                job::run(&client, &handle, &work_dir, &job).await;
                state.unregister(&job.id);
                eprintln!("Worker {index} finished job {}", job.id);
            }
            Ok(None) => {}
            Err(ApiError::Unauthorized) => {
                state.set_revoked(true);
            }
            Err(e) => {
                eprintln!("Worker {index} could not request a job: {e}");
                tokio::time::sleep(WORKER_ERROR_BACKOFF).await;
            }
        }
    }
}
