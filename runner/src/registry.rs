use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use nix::sys::signal::{killpg, Signal};
use nix::unistd::Pid;

use crate::api::types::UpdateInfo;

#[derive(Clone, Default)]
pub struct JobHandle {
    cancelled: Arc<AtomicBool>,
    pgid: Arc<Mutex<Option<i32>>>,
}

impl JobHandle {
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn set_pgid(&self, pgid: Option<i32>) {
        *self.pgid.lock().unwrap() = pgid;
        if pgid.is_some() && self.is_cancelled() {
            self.kill();
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.kill();
    }

    fn kill(&self) {
        if let Some(pgid) = *self.pgid.lock().unwrap() {
            let _ = killpg(Pid::from_raw(pgid), Signal::SIGTERM);
            let pgid = Pid::from_raw(pgid);
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(15));
                let _ = killpg(pgid, Signal::SIGKILL);
            });
        }
    }
}

#[derive(Default)]
pub struct State {
    jobs: Mutex<HashMap<String, JobHandle>>,
    draining: AtomicBool,
    revoked: AtomicBool,
    update: Mutex<Option<UpdateInfo>>,
    failed_updates: Mutex<HashSet<String>>,
}

impl State {
    pub fn register(&self, job_id: &str) -> JobHandle {
        let handle = JobHandle::default();
        self.jobs
            .lock()
            .unwrap()
            .insert(job_id.to_string(), handle.clone());
        handle
    }

    pub fn unregister(&self, job_id: &str) {
        self.jobs.lock().unwrap().remove(job_id);
    }

    pub fn running_ids(&self) -> Vec<String> {
        self.jobs.lock().unwrap().keys().cloned().collect()
    }

    pub fn running_count(&self) -> usize {
        self.jobs.lock().unwrap().len()
    }

    pub fn cancel(&self, job_id: &str) {
        if let Some(handle) = self.jobs.lock().unwrap().get(job_id) {
            eprintln!("Cancelling job {job_id} as requested by the Forge");
            handle.cancel();
        }
    }

    pub fn cancel_all(&self) {
        for handle in self.jobs.lock().unwrap().values() {
            handle.cancel();
        }
    }

    pub fn is_draining(&self) -> bool {
        self.draining.load(Ordering::SeqCst)
    }

    pub fn set_draining(&self, value: bool) {
        self.draining.store(value, Ordering::SeqCst);
    }

    pub fn is_revoked(&self) -> bool {
        self.revoked.load(Ordering::SeqCst)
    }

    pub fn set_revoked(&self, value: bool) -> bool {
        self.revoked.swap(value, Ordering::SeqCst)
    }

    pub fn offer_update(&self, update: Option<UpdateInfo>) {
        let update = update.filter(|u| !self.failed_updates.lock().unwrap().contains(&u.sha256));
        *self.update.lock().unwrap() = update;
    }

    pub fn pending_update(&self) -> Option<UpdateInfo> {
        self.update.lock().unwrap().clone()
    }

    pub fn mark_update_failed(&self, sha256: &str) {
        self.failed_updates.lock().unwrap().insert(sha256.to_string());
        *self.update.lock().unwrap() = None;
        self.set_draining(false);
    }
}
