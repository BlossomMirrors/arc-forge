use std::path::Path;
use std::sync::Arc;

use crate::api::types::HeartbeatRequest;
use crate::api::{ApiError, Client};
use crate::config::Config;
use crate::constants::{CONFIG_PATH, HEARTBEAT_INTERVAL, REVOKED_INTERVAL, VERSION};
use crate::registry::State;
use crate::system;

pub fn request(concurrency: usize, running_job_ids: Vec<String>) -> HeartbeatRequest {
    HeartbeatRequest {
        version: VERSION.to_string(),
        arch: system::arch().to_string(),
        hostname: system::hostname(),
        os: system::os_name(),
        concurrency,
        running_job_ids,
    }
}

fn reload_token(client: &Client) {
    let Ok(config) = Config::load(Path::new(CONFIG_PATH)) else {
        return;
    };
    if config.token != client.token() {
        eprintln!("Picked up a new token from {CONFIG_PATH}");
        client.set_token(config.token);
    }
}

pub async fn run(client: Arc<Client>, state: Arc<State>, concurrency: usize) {
    loop {
        if state.is_revoked() {
            reload_token(&client);
        }

        match client
            .heartbeat(&request(concurrency, state.running_ids()))
            .await
        {
            Ok(response) => {
                if state.set_revoked(false) {
                    eprintln!("Token accepted again, resuming work");
                }
                for job_id in response.cancel_job_ids {
                    state.cancel(&job_id);
                }
                state.offer_update(response.update);
            }
            Err(ApiError::Unauthorized) => {
                if !state.set_revoked(true) {
                    eprintln!(
                        "The Forge rejected this runner's token. Regenerate it in the Runners menu and rerun the install command."
                    );
                    state.cancel_all();
                }
            }
            Err(e) => eprintln!("Heartbeat failed: {e}"),
        }

        let delay = if state.is_revoked() {
            REVOKED_INTERVAL
        } else {
            HEARTBEAT_INTERVAL
        };
        tokio::time::sleep(delay).await;
    }
}
