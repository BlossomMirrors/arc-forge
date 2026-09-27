use std::fs;
use std::path::Path;

use anyhow::Result;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

use super::process::Step;
use crate::args;

pub struct Appstream {
    pub metainfo_b64: Option<String>,
    pub icon_b64: Option<String>,
}

fn metainfo_candidates(appid: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for base in ["files/share/metainfo", "export/share/metainfo"] {
        for ext in ["metainfo.xml", "appdata.xml"] {
            paths.push(format!("{base}/{appid}.{ext}"));
        }
    }
    paths
}

fn icon_candidates(appid: &str) -> Vec<String> {
    vec![
        format!("export/share/app-info/icons/flatpak/128x128/{appid}.png"),
        format!("export/share/app-info/icons/flatpak/64x64/{appid}.png"),
        format!("files/share/icons/hicolor/256x256/apps/{appid}.png"),
        format!("files/share/icons/hicolor/128x128/apps/{appid}.png"),
        format!("files/share/icons/hicolor/64x64/apps/{appid}.png"),
        format!("files/share/icons/hicolor/48x48/apps/{appid}.png"),
        format!("files/share/icons/hicolor/scalable/apps/{appid}.svg"),
        format!("files/share/icons/hicolor/scalable/apps/{appid}.png"),
    ]
}

fn first_existing(root: &Path, candidates: &[String]) -> Option<String> {
    candidates
        .iter()
        .map(|c| root.join(c))
        .find(|p| p.is_file())
        .and_then(|p| fs::read(p).ok())
        .map(|bytes| STANDARD.encode(bytes))
}

pub async fn extract(step: &Step<'_>, appid: &str, main_ref: &str, dir: &Path) -> Result<Appstream> {
    let checkout = dir.join("post-build-checkout");
    step.run(
        "ostree",
        &args![
            "checkout",
            "-U",
            format!("--repo={}", dir.join("local-repo").display()),
            main_ref,
            checkout.display()
        ],
    )
    .await?;

    let appstream = Appstream {
        metainfo_b64: first_existing(&checkout, &metainfo_candidates(appid)),
        icon_b64: first_existing(&checkout, &icon_candidates(appid)),
    };
    let _ = fs::remove_dir_all(&checkout);
    Ok(appstream)
}
