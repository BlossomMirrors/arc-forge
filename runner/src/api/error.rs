use reqwest::StatusCode;
use serde::Deserialize;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("the runner token was rejected by the Forge")]
    Unauthorized,
    #[error("the job is no longer active on the Forge")]
    Gone,
    #[error("the Forge reported a different position ({0})")]
    Conflict(u64),
    #[error("temporary failure: {0}")]
    Transient(String),
    #[error("request failed: {0}")]
    Fatal(String),
}

impl ApiError {
    pub fn is_transient(&self) -> bool {
        matches!(self, ApiError::Transient(_))
    }
}

impl From<reqwest::Error> for ApiError {
    fn from(e: reqwest::Error) -> Self {
        ApiError::Transient(e.to_string())
    }
}

#[derive(Deserialize)]
struct ConflictBody {
    offset: Option<u64>,
    size: Option<u64>,
}

pub async fn check(response: reqwest::Response) -> Result<reqwest::Response, ApiError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    match status {
        StatusCode::UNAUTHORIZED => Err(ApiError::Unauthorized),
        StatusCode::GONE | StatusCode::NOT_FOUND => Err(ApiError::Gone),
        StatusCode::CONFLICT => {
            let body: ConflictBody = response
                .json()
                .await
                .map_err(|e| ApiError::Fatal(e.to_string()))?;
            Err(ApiError::Conflict(body.offset.or(body.size).unwrap_or(0)))
        }
        s if s.is_server_error() || s == StatusCode::TOO_MANY_REQUESTS => {
            Err(ApiError::Transient(format!("HTTP {s}")))
        }
        s => {
            let text = response.text().await.unwrap_or_default();
            Err(ApiError::Fatal(format!("HTTP {s}: {text}")))
        }
    }
}
