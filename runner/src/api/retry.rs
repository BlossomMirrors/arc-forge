use std::future::Future;
use std::time::Duration;

use super::ApiError;
use crate::constants::MAX_RETRIES;

pub async fn with_retry<T, F, Fut>(label: &str, mut f: F) -> Result<T, ApiError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, ApiError>>,
{
    let mut attempt = 0;
    loop {
        match f().await {
            Err(e) if e.is_transient() && attempt < MAX_RETRIES => {
                attempt += 1;
                let delay = Duration::from_secs((2u64.pow(attempt.min(6))).min(60));
                eprintln!("{label} failed ({e}), retrying in {}s", delay.as_secs());
                tokio::time::sleep(delay).await;
            }
            other => return other,
        }
    }
}
