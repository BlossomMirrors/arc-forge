mod error;
mod retry;
pub mod types;

use std::sync::RwLock;

use reqwest::{header, Client as HttpClient, StatusCode};

pub use error::ApiError;
pub use retry::with_retry;
use types::*;

use crate::constants::{
    CONNECT_TIMEOUT, DEFAULT_REQUEST_TIMEOUT, FORGE_URL, JOB_REQUEST_TIMEOUT,
    UPLOAD_REQUEST_TIMEOUT, VERSION,
};

pub struct Client {
    http: HttpClient,
    token: RwLock<String>,
}

impl Client {
    pub fn new(token: String) -> anyhow::Result<Self> {
        let http = HttpClient::builder()
            .user_agent(format!("forge-runner/{VERSION}"))
            .connect_timeout(CONNECT_TIMEOUT)
            .build()?;
        Ok(Self {
            http,
            token: RwLock::new(token),
        })
    }

    pub fn token(&self) -> String {
        self.token.read().unwrap().clone()
    }

    pub fn set_token(&self, token: String) {
        *self.token.write().unwrap() = token;
    }

    fn url(path: &str) -> String {
        format!("{FORGE_URL}{path}")
    }

    fn authorized(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        builder.header(header::AUTHORIZATION, format!("Bearer {}", self.token()))
    }

    pub async fn heartbeat(&self, body: &HeartbeatRequest) -> Result<HeartbeatResponse, ApiError> {
        let response = self
            .authorized(self.http.post(Self::url("/api/runner/heartbeat")))
            .timeout(DEFAULT_REQUEST_TIMEOUT)
            .json(body)
            .send()
            .await?;
        Ok(error::check(response).await?.json().await?)
    }

    pub async fn request_job(&self, arch: &str) -> Result<Option<Job>, ApiError> {
        let response = self
            .authorized(self.http.post(Self::url("/api/runner/jobs/request")))
            .timeout(JOB_REQUEST_TIMEOUT)
            .json(&JobRequest {
                arch: arch.to_string(),
            })
            .send()
            .await?;
        let response = error::check(response).await?;
        if response.status() == StatusCode::NO_CONTENT {
            return Ok(None);
        }
        Ok(Some(response.json().await?))
    }

    pub async fn append_log(&self, job_id: &str, offset: u64, text: &str) -> Result<u64, ApiError> {
        let response = self
            .authorized(self.http.post(Self::url(&format!("/api/runner/jobs/{job_id}/log"))))
            .timeout(DEFAULT_REQUEST_TIMEOUT)
            .json(&LogChunk { offset, text })
            .send()
            .await?;
        let body: OffsetResponse = error::check(response).await?.json().await?;
        Ok(body.offset)
    }

    pub async fn artifact_size(&self, job_id: &str) -> Result<u64, ApiError> {
        let response = self
            .authorized(self.http.get(Self::url(&format!("/api/runner/jobs/{job_id}/artifact"))))
            .timeout(DEFAULT_REQUEST_TIMEOUT)
            .send()
            .await?;
        let body: SizeResponse = error::check(response).await?.json().await?;
        Ok(body.size)
    }

    pub async fn put_artifact_chunk(
        &self,
        job_id: &str,
        offset: u64,
        chunk: Vec<u8>,
    ) -> Result<u64, ApiError> {
        let response = self
            .authorized(self.http.put(Self::url(&format!(
                "/api/runner/jobs/{job_id}/artifact?offset={offset}"
            ))))
            .timeout(UPLOAD_REQUEST_TIMEOUT)
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .body(chunk)
            .send()
            .await?;
        let body: SizeResponse = error::check(response).await?.json().await?;
        Ok(body.size)
    }

    pub async fn complete(&self, job_id: &str, body: &CompleteRequest) -> Result<(), ApiError> {
        let response = self
            .authorized(self.http.post(Self::url(&format!("/api/runner/jobs/{job_id}/complete"))))
            .timeout(DEFAULT_REQUEST_TIMEOUT)
            .json(body)
            .send()
            .await?;
        error::check(response).await?;
        Ok(())
    }

    pub async fn download_binary(&self, arch: &str) -> Result<Vec<u8>, ApiError> {
        let response = self
            .http
            .get(Self::url(&format!("/runner/download/{arch}")))
            .timeout(UPLOAD_REQUEST_TIMEOUT)
            .send()
            .await?;
        Ok(error::check(response).await?.bytes().await?.to_vec())
    }
}
