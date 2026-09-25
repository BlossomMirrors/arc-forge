use std::fs;

pub fn arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        other => other,
    }
}

pub fn hostname() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn os_name() -> String {
    let Ok(raw) = fs::read_to_string("/etc/os-release") else {
        return String::new();
    };
    raw.lines()
        .find_map(|line| line.strip_prefix("PRETTY_NAME="))
        .map(|value| value.trim_matches('"').to_string())
        .unwrap_or_default()
}
