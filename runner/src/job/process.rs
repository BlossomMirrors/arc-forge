use std::path::Path;
use std::process::Stdio;

use anyhow::{bail, Context, Result};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;

use super::logstream::LogSink;
use crate::registry::JobHandle;

pub struct Step<'a> {
    pub handle: &'a JobHandle,
    pub log: &'a LogSink,
    pub cwd: &'a Path,
}

fn pipe_lines<R>(reader: R, log: LogSink, capture: bool) -> tokio::task::JoinHandle<String>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut captured = String::new();
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if capture {
                captured.push_str(&line);
                captured.push('\n');
            } else {
                log.line(line);
            }
        }
        captured
    })
}

impl Step<'_> {
    async fn exec(&self, program: &str, args: &[String], capture: bool) -> Result<String> {
        if self.handle.is_cancelled() {
            bail!("job was cancelled");
        }
        if !capture {
            self.log.line(format!("$ {program} {}", args.join(" ")));
        }

        let mut child = Command::new(program)
            .args(args)
            .current_dir(self.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0)
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("Could not start {program}"))?;

        self.handle.set_pgid(child.id().map(|id| id as i32));
        let stdout = pipe_lines(child.stdout.take().unwrap(), self.log.clone(), capture);
        let stderr = pipe_lines(child.stderr.take().unwrap(), self.log.clone(), false);
        let status = child.wait().await?;
        self.handle.set_pgid(None);
        let output = stdout.await.unwrap_or_default();
        let _ = stderr.await;

        if self.handle.is_cancelled() {
            bail!("job was cancelled");
        }
        if !status.success() {
            bail!("{program} exited with {status}");
        }
        Ok(output)
    }

    pub async fn run(&self, program: &str, args: &[String]) -> Result<()> {
        self.exec(program, args, false).await.map(|_| ())
    }

    pub async fn capture(&self, program: &str, args: &[String]) -> Result<String> {
        self.exec(program, args, true).await
    }
}

#[macro_export]
macro_rules! args {
    ($($arg:expr),* $(,)?) => {
        vec![$(::std::string::ToString::to_string(&$arg)),*]
    };
}
