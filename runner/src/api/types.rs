use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRequest {
    pub version: String,
    pub arch: String,
    pub hostname: String,
    pub os: String,
    pub concurrency: usize,
    pub running_job_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatResponse {
    #[serde(default)]
    pub cancel_job_ids: Vec<String>,
    pub update: Option<UpdateInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRequest {
    pub arch: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub appid: String,
    pub arch: String,
    pub git_url: String,
    pub git_branch: String,
    pub manifest_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogChunk<'a> {
    pub offset: u64,
    pub text: &'a str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffsetResponse {
    pub offset: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeResponse {
    pub size: u64,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteRequest {
    pub success: bool,
    pub error: Option<String>,
    pub git_commit: Option<String>,
    pub metainfo_b64: Option<String>,
    pub icon_b64: Option<String>,
    pub refs: Vec<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
}
