# Forge

A developer and review platform for the Arc PWA store. Developers submit PWAs and Flatpak apps for review; staff and reviewers approve or reject them (approving a Flatpak actually builds and publishes it to the signed repo). Manages apps, the Lutris whitelist, and front-page content, and exposes a public HTTP API consumed by the store client.

## Stack

- [SvelteKit](https://kit.svelte.dev/) + Svelte 5
- [Prisma](https://www.prisma.io/) on PostgreSQL
- [better-auth](https://www.better-auth.com/) with Authentik OIDC
- Tailwind CSS + shadcn-svelte

## Prerequisites

- Node.js >= 20 or Bun
- PostgreSQL database
- An [Authentik](https://goauthentik.io/) instance with an OAuth2/OIDC provider configured for this app (application slug: `arc-forge`), with a scope mapping that exposes the user's groups as a `groups` claim (requested via the `groups` OAuth scope)

## Setup

```sh
# Install dependencies
bun install

# Copy and fill in environment variables
cp .env.example .env

# Run database migrations
bunx prisma migrate deploy

# Start the dev server
bun run dev
```

## Environment variables

| Variable                      | Description                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/forge`                                                                                                                                                |
| `BETTER_AUTH_SECRET`          | Random secret used to sign sessions                                                                                                                                                                                             |
| `BETTER_AUTH_URL`             | Public URL of this app, e.g. `https://forge.example.com`                                                                                                                                                                        |
| `AUTHENTIK_URL`               | Base URL of your Authentik instance, e.g. `https://auth.example.com`                                                                                                                                                            |
| `AUTHENTIK_CLIENT_ID`         | OAuth client ID from the Authentik provider                                                                                                                                                                                     |
| `AUTHENTIK_CLIENT_SECRET`     | OAuth client secret from the Authentik provider                                                                                                                                                                                 |
| `GITHUB_CLIENT_ID`            | Client ID of a GitHub OAuth App, used for GitHub sign-in and browsing repos in the Flatpak Git submission form (`public_repo` scope only, private repos are never listed)                                                       |
| `GITHUB_CLIENT_SECRET`        | Client secret of the same GitHub OAuth App                                                                                                                                                                                      |
| `R2_ACCOUNT_ID`               | Cloudflare account ID owning the R2 buckets (EU jurisdiction): `blossom-cdn` for uploads, and whichever bucket Infra Settings points the Flatpak repo mount at                                                                  |
| `R2_ACCESS_KEY_ID`            | S3-compatible access key ID, reused for both the upload bucket and the Flatpak repo mount                                                                                                                                       |
| `R2_SECRET_ACCESS_KEY`        | S3-compatible secret access key, reused for both the upload bucket and the Flatpak repo mount                                                                                                                                   |
| `FORGE_SECRETS_KEY`           | Encrypts the Flatpak publish pipeline's SSH key/GPG key/GPG passphrase at rest in Postgres. Keep distinct from `BETTER_AUTH_SECRET`                                                                                             |
| `FLATPAK_MAX_BUNDLE_BYTES`    | Max accepted `.flatpak` upload size in bytes (default 2 GiB)                                                                                                                                                                    |
| `RESEND_API_KEY`              | [Resend](https://resend.com) API key, used to email every in-app notification. From name is always "Arc Forge"                                                                                                                  |
| `RESEND_FROM_EMAIL`           | Verified sender address in Resend, e.g. `no-reply@blossomos.org`                                                                                                                                                                |
| `EMAIL_NOTIFICATIONS_ENABLED` | Set to `false` to turn off notification emails; on by default                                                                                                                                                                   |
| `METADEFENDER_API_KEY`        | [OPSWAT MetaDefender Cloud](https://metadefender.opswat.com/) API key. Every uploaded Flatpak bundle is scanned for malware at submission time before it can enter the review queue; missing this blocks all bundle submissions |

## Building

```sh
bun run build
bun run preview
```

## Docker

```sh
# Copy and fill in your .env, then:
docker compose up --build
```

The app starts on port 3000 and runs `prisma migrate deploy` automatically on startup.

## Dashboard

The dashboard at `/dashboard` is protected by Authentik login. Access is scoped by the Authentik groups (called "roles" in Forge) on the signed-in user:

- **PWAs**: everyone can submit a PWA. Submissions from members of the `staff` group are auto-approved; everyone else's go into a `PENDING` review queue and stay off the public `/api/pwas` feed until approved. A submitter can only edit or delete their own apps (staff can manage any); editing an already-approved app puts it back into review unless a staff member makes the edit.
- **Developer Profile**: non-staff submitters attribute their PWA to a developer profile rather than typing a developer name directly. A developer profile is created and joined like a team. You can create one, invite others by email, and accept invitations sent to you. The submitter's `developerName` is always taken from a developer profile they're a verified member of; only staff can type a developer name freely. This is built on better-auth's [organization plugin](https://better-auth.com/docs/plugins/organization) (its `organization`/`member`/`invitation` tables are named `DeveloperProfile`/`DeveloperProfileMember`/`DeveloperProfileInvitation` in this app).
- **Flatpaks**: everyone can submit a prebuilt `.flatpak` bundle plus its store metadata (name, description, icon, screenshots) via a web form. Every submission starts `PENDING`, regardless of who submits it, unlike PWAs, there's no staff auto-approve here, because approving a Flatpak has a real side effect (see below). Editing a submission (including by staff) always resets it back to `PENDING`.
- **Review**: available to `staff` and `forge-reviewer` groups. Approving a PWA just flips its status. Approving a Flatpak is different: it flips to `PROCESSING` and asynchronously builds and publishes it (see "Flatpak publishing" below). Only a successful build is marked `APPROVED`; a failed one is marked `FAILED` with the build log visible to reviewers, retryable in place. A rejection note is shown to the submitter either way.
- **Infra Settings**: `admin`-only (a group independent of `staff`/`forge-reviewer`, scoped narrowly to this page). Generates the SSH keypair Forge uses to reach both the Flatpak repo (signing) host and the separate Docker build host, and holds the GPG signing key and passphrase used to sign commits during publish. All are encrypted at rest in Postgres via `FORGE_SECRETS_KEY`.
- **Whitelist**: manage the Lutris game whitelist. `staff` only.
- **Front Page**: visual block editor for the store's home page (type `/` anywhere to insert blocks). `staff` only.

Roles are synced from the Authentik `groups` claim on every sign-in and are not user-editable through the app; they're only ever written by the server after verifying the OIDC token.

## Flatpak publishing

Approving a Flatpak submission runs a generated script over SSH. Where that script runs depends on how the app was submitted:

- **BUNDLE** (a developer uploaded a prebuilt `.flatpak`): runs entirely on the signing host (default `repo.blossomos.org`, configurable in Infra Settings) - imports the bundle, validates it, and publishes it into the signed OSTree repo.
- **GIT** (a developer instead points at a repo + manifest): first builds in isolation on a separate **build host** (Infra Settings -> Build Host) inside a Docker container, which never receives the GPG signing key or R2/repo credentials. Once that produces an unsigned bundle, Forge streams it straight to the signing host, which imports/signs/publishes it exactly like a BUNDLE submission would.

Before either path can work, a few one-time things need to be set up on the relevant host(s) themselves. Forge doesn't and can't automate these:

**On the signing host** (used by both submission types):

1. Generate an SSH key in Infra Settings, then add the displayed public key to that host's `authorized_keys` for the account configured as the SSH user (`remoteUser` in Infra Settings, default `forge`).
2. `docker` (or a compatible CLI) installed and runnable by that account, **plus passwordless `sudo` for that same command** (`buildRemoteScript` runs `sudo docker run --privileged ...`, same as the build host below - see that entry for why `sudo`+`--privileged` specifically, and why plain `--cap-add=SYS_ADMIN`/`--privileged` without `sudo` isn't enough on rootless Podman). GPG import, `flatpak build-import-bundle`, and `flatpak build-update-repo` all now run inside this container rather than directly on the host (added 2026-08-07, after a real, reproduced `renameat: Operation not permitted` from `build-import-bundle` writing into a local staging repo directly on the host's own filesystem). Headless GPG signing (`allow-preset-passphrase`) is baked into the container image itself, not a host-level `gpg-agent.conf` setting anymore - nothing to configure or reload on this host for that.
3. Install `rclone` and FUSE (`fusermount`/`mountpoint`) on the host itself (this part stays outside the container - rclone mount needs real FUSE access, and mounting was never the source of the problem above). The OSTree repo itself lives in a Cloudflare R2 bucket, not on the host's local disk (bucket/path configurable in Infra Settings). Every publish/repair/unpublish script mounts that bucket with `rclone mount` for the duration of the run, using Forge's own `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, and unmounts it again before exiting, nothing is written to an `rclone.conf` on the host. If the configured bucket/path has no repo yet, it needs to be `ostree init --mode=archive-z2`'d once, same "Forge assumes it's already there" posture as the runtimes/tooling below.

The GPG signing key itself is uploaded in Infra Settings (paste the ASCII-armored private key), not assumed to already exist anywhere. Every publish/repair/unpublish run imports it fresh into that run's disposable container and derives its fingerprint straight from the key file, so losing the container's keyring (which happens on every single run, `--rm`) never means losing the signing key itself.

**On the build host** (only needed for GIT submissions, entered under Infra Settings -> Build Host):

1. Same SSH key as above, authorized in this host's `authorized_keys` too, for the account configured as `buildUser` (default `forge`).
2. `docker` (or a compatible CLI) installed and runnable by that account, **plus passwordless `sudo` for that same command** (`buildDockerBuildScript` runs `sudo docker run --privileged ...`). This is required even if the underlying tool is genuinely Docker, but is non-negotiable if it's actually Podman (e.g. Fedora's `podman-docker` package providing a `docker` shim) - Podman's default rootless mode remaps container root onto an unprivileged subordinate UID from `/etc/subuid` no matter what capabilities or `--privileged` are added, so it can never actually access the bind-mounted `$WORKDIR` (owned by `buildUser`'s own real UID). Rootful Podman's container root is real host root, same as the pipeline's original pre-Docker-isolation design, avoiding that whole class of problem. Confirmed in production: this is exactly what produced `bwrap: Can't find source path .../build-dir/files: Permission denied` mid-build - `--cap-add=SYS_ADMIN` and later plain `--privileged` (no sudo) were both tried first and neither fixed it, since neither touches UID mapping.
3. An image with `flatpak`/`flatpak-builder`/`git`/`ostree`/`gnupg2`/`rclone`/`curl` plus the flathub remote pre-added, made available here under whatever tag `buildDockerImage` is set to (defaults to `registry.blossomos.org/blossom/arc-store/flatpak-builder-docker:latest`). **This is the same image `buildRemoteScript` uses on the signing host too** - one image serves both purposes, maintained outside this repo. **Must be pulled/loaded into root's own Podman/Docker storage** (`/var/lib/containers` for rootful Podman) on *each* host that runs it, not just `buildUser`'s/`remoteUser`'s rootless storage (`~/.local/share/containers`) - the two are entirely separate stores, and `sudo docker run` only ever sees the root one.

This host never receives the GPG signing key, R2 credentials, or SSH access to the signing host - `flatpak-builder` runs arbitrary commands from whatever manifest a GIT submission points at, so keeping it fully separate from anything that can sign or publish is the point. Note that granting `buildUser` passwordless root via sudo means a malicious manifest could escalate to real root on this host - an accepted trade-off since the host holds nothing sensitive to begin with (that's the entire reason it's separate from the signing host).

There's no queue/worker process behind Flatpak publishing, it's a fire-and-forget background task in the same server process. If the app restarts mid-build, the row is left on `PROCESSING` and needs a manual retry from the Review page; this is a deliberate trade-off to avoid adding a full job queue for what's expected to be low-volume.

## API

See [API.md](./API.md) for the public HTTP API consumed by store clients.
