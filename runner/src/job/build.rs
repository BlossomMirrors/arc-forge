use std::path::Path;

use anyhow::{bail, Result};

use super::process::Step;
use crate::api::types::Job;
use crate::args;
use crate::constants::FLATHUB_REPO_URL;

pub struct BuildOutput {
    pub git_commit: String,
    pub main_ref: String,
    pub refs: Vec<String>,
}

fn ref_matches(r: &str, kind: &str, name: &str, arch: &str) -> bool {
    r.starts_with(&format!("{kind}/{name}/{arch}/"))
}

fn select_refs(all: &str, job: &Job) -> Result<(String, Vec<String>)> {
    let refs: Vec<&str> = all.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let main = refs
        .iter()
        .find(|r| ref_matches(r, "app", &job.appid, &job.arch))
        .or_else(|| refs.iter().find(|r| ref_matches(r, "runtime", &job.appid, &job.arch)));
    let Some(main) = main else {
        bail!(
            "Could not find a matching app or runtime ref for {} after building (appid mismatch, or the build did not produce a ref)",
            job.appid
        );
    };

    let mut selected = vec![main.to_string()];
    for suffix in ["Locale"] {
        let name = format!("{}.{suffix}", job.appid);
        if let Some(extra) = refs.iter().find(|r| ref_matches(r, "runtime", &name, &job.arch)) {
            selected.push(extra.to_string());
        }
    }
    Ok((main.to_string(), selected))
}

pub async fn build(step: &Step<'_>, job: &Job, dir: &Path, cache_dir: &Path) -> Result<BuildOutput> {
    let src = dir.join("src");
    let repo = dir.join("local-repo");
    let build_dir = dir.join("build-dir");

    step.run(
        "git",
        &args![
            "clone",
            "--recurse-submodules",
            "--depth",
            "1",
            "--branch",
            job.git_branch,
            job.git_url,
            src.display()
        ],
    )
    .await?;
    let git_commit = step
        .capture("git", &args!["-C", src.display(), "rev-parse", "HEAD"])
        .await?
        .trim()
        .to_string();
    step.log.line(format!("Building commit {git_commit}"));

    step.run(
        "flatpak",
        &args!["remote-add", "--user", "--if-not-exists", "flathub", FLATHUB_REPO_URL],
    )
    .await?;

    step.run(
        "flatpak-builder",
        &args![
            "--user",
            format!("--arch={}", job.arch),
            format!("--repo={}", repo.display()),
            format!("--state-dir={}", cache_dir.display()),
            "--force-clean",
            "--disable-rofiles-fuse",
            "--install-deps-from=flathub",
            build_dir.display(),
            src.join(&job.manifest_path).display()
        ],
    )
    .await?;

    let all_refs = step
        .capture("ostree", &args!["refs", format!("--repo={}", repo.display())])
        .await?;
    let (main_ref, refs) = select_refs(&all_refs, job)?;
    step.log.line(format!("Built refs: {}", refs.join(", ")));

    Ok(BuildOutput {
        git_commit,
        main_ref,
        refs,
    })
}
