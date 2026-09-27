mod api;
mod config;
mod constants;
mod heartbeat;
mod install;
mod job;
mod registry;
mod system;
mod update;
mod worker;

use std::path::Path;
use std::sync::Arc;

use anyhow::Result;
use clap::{Parser, Subcommand};
use tokio::signal::unix::{signal, SignalKind};

use api::Client;
use config::Config;
use constants::{CONFIG_PATH, FORGE_URL, VERSION};
use registry::State;

#[derive(Parser)]
#[command(name = "forge-runner", version = VERSION)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    Install {
        #[arg(long)]
        token: String,
        #[arg(long)]
        concurrency: Option<usize>,
    },
    Run,
    Version,
}

async fn run_daemon() -> Result<()> {
    let config = Config::load(Path::new(CONFIG_PATH))?;
    let client = Arc::new(Client::new(config.token.clone())?);
    let state = Arc::new(State::default());

    eprintln!(
        "Forge runner {VERSION} ({}) connecting to {FORGE_URL} with {} worker(s)",
        system::arch(),
        config.concurrency
    );

    tokio::spawn(heartbeat::run(client.clone(), state.clone(), config.concurrency));
    tokio::spawn(update::run(client.clone(), state.clone()));
    for index in 0..config.concurrency {
        tokio::spawn(worker::run(
            index,
            client.clone(),
            state.clone(),
            config.work_dir.clone(),
        ));
    }

    let mut terminate = signal(SignalKind::terminate())?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    tokio::select! {
        _ = terminate.recv() => {},
        _ = interrupt.recv() => {},
    }
    eprintln!("Shutting down, cancelling running jobs");
    state.cancel_all();
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command.unwrap_or(Commands::Run) {
        Commands::Install { token, concurrency } => install::install(token, concurrency).await,
        Commands::Run => run_daemon().await,
        Commands::Version => {
            println!("{VERSION}");
            Ok(())
        }
    }
}
