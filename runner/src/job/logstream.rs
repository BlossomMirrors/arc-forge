use std::sync::Arc;

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::api::{ApiError, Client};
use crate::constants::{LOG_FLUSH_INTERVAL, MAX_PENDING_LOG_BYTES};
use crate::registry::JobHandle;

#[derive(Clone)]
pub struct LogSink {
    tx: mpsc::UnboundedSender<String>,
}

impl LogSink {
    pub fn line(&self, text: impl Into<String>) {
        let mut text = text.into();
        text.push('\n');
        let _ = self.tx.send(text);
    }
}

pub struct LogStream {
    sink: LogSink,
    task: JoinHandle<()>,
}

struct Flusher {
    client: Arc<Client>,
    handle: JobHandle,
    job_id: String,
    offset: u64,
    pending: String,
}

impl Flusher {
    fn push(&mut self, text: &str) {
        self.pending.push_str(text);
        if self.pending.len() > MAX_PENDING_LOG_BYTES {
            let mut cut = self.pending.len() - MAX_PENDING_LOG_BYTES;
            while !self.pending.is_char_boundary(cut) {
                cut += 1;
            }
            self.pending.drain(..cut);
        }
    }

    async fn flush(&mut self) {
        if self.pending.is_empty() {
            return;
        }
        match self
            .client
            .append_log(&self.job_id, self.offset, &self.pending)
            .await
        {
            Ok(offset) => {
                self.offset = offset;
                self.pending.clear();
            }
            Err(ApiError::Conflict(offset)) => self.offset = offset,
            Err(ApiError::Gone) => self.handle.cancel(),
            Err(e) => eprintln!("Could not send log for job {}: {e}", self.job_id),
        }
    }
}

impl LogStream {
    pub fn start(client: Arc<Client>, handle: JobHandle, job_id: String) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        let mut flusher = Flusher {
            client,
            handle,
            job_id,
            offset: 0,
            pending: String::new(),
        };
        let task = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(LOG_FLUSH_INTERVAL);
            loop {
                tokio::select! {
                    message = rx.recv() => match message {
                        Some(text) => flusher.push(&text),
                        None => break,
                    },
                    _ = ticker.tick() => flusher.flush().await,
                }
            }
            for _ in 0..5 {
                flusher.flush().await;
                if flusher.pending.is_empty() {
                    break;
                }
                tokio::time::sleep(LOG_FLUSH_INTERVAL).await;
            }
        });
        Self {
            sink: LogSink { tx },
            task,
        }
    }

    pub fn sink(&self) -> LogSink {
        self.sink.clone()
    }

    pub async fn finish(self) {
        drop(self.sink);
        let _ = self.task.await;
    }
}
