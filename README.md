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
| `R2_ACCOUNT_ID`               | Cloudflare account ID owning the `blossom-cdn` R2 bucket (EU jurisdiction), used for icon/screenshot/bundle uploads - see `src/lib/server/r2.ts`. Not used for the Flatpak repo itself, which is served straight off local disk now, see "Flatpak publishing" below |
| `R2_ACCESS_KEY_ID`            | S3-compatible access key ID for the upload bucket                                                                                                                                                                               |
| `R2_SECRET_ACCESS_KEY`        | S3-compatible secret access key for the upload bucket                                                                                                                                                                           |
| `FORGE_SECRETS_KEY`           | Encrypts the Flatpak publish pipeline's GPG key/GPG passphrase at rest in Postgres. Keep distinct from `BETTER_AUTH_SECRET`                                                                                                     |
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

The app starts on port 3000 and runs `prisma migrate deploy` automatically on startup. Before the Flatpak publish pipeline works, the `flatpak-repo` volume's block storage needs attaching/mounting first - see "Flatpak publishing" below.

## Dashboard

The dashboard at `/dashboard` is protected by Authentik login. Access is scoped by the Authentik groups (called "roles" in Forge) on the signed-in user:

- **PWAs**: everyone can submit a PWA. Submissions from members of the `staff` group are auto-approved; everyone else's go into a `PENDING` review queue and stay off the public `/api/pwas` feed until approved. A submitter can only edit or delete their own apps (staff can manage any); editing an already-approved app puts it back into review unless a staff member makes the edit.
- **Developer Profile**: non-staff submitters attribute their PWA to a developer profile rather than typing a developer name directly. A developer profile is created and joined like a team. You can create one, invite others by email, and accept invitations sent to you. The submitter's `developerName` is always taken from a developer profile they're a verified member of; only staff can type a developer name freely. This is built on better-auth's [organization plugin](https://better-auth.com/docs/plugins/organization) (its `organization`/`member`/`invitation` tables are named `DeveloperProfile`/`DeveloperProfileMember`/`DeveloperProfileInvitation` in this app).
- **Flatpaks**: everyone can submit a prebuilt `.flatpak` bundle plus its store metadata (name, description, icon, screenshots) via a web form. Every submission starts `PENDING`, regardless of who submits it, unlike PWAs, there's no staff auto-approve here, because approving a Flatpak has a real side effect (see below). Editing a submission (including by staff) always resets it back to `PENDING`.
- **Review**: available to `staff` and `forge-reviewer` groups. Approving a PWA just flips its status. Approving a Flatpak is different: it flips to `PROCESSING` and asynchronously builds and publishes it (see "Flatpak publishing" below). Only a successful build is marked `APPROVED`; a failed one is marked `FAILED` with the build log visible to reviewers, retryable in place. A rejection note is shown to the submitter either way.
- **Infra Settings**: `admin`-only (a group independent of `staff`/`forge-reviewer`, scoped narrowly to this page). Holds the GPG signing key and passphrase used to sign commits during publish. Encrypted at rest in Postgres via `FORGE_SECRETS_KEY`.
- **Whitelist**: manage the Lutris game whitelist. `staff` only.
- **Front Page**: visual block editor for the store's home page (type `/` anywhere to insert blocks). `staff` only.

Roles are synced from the Authentik `groups` claim on every sign-in and are not user-editable through the app; they're only ever written by the server after verifying the OIDC token.

## Flatpak publishing

Approving a Flatpak submission runs a single generated script as a plain subprocess of Forge's own server process, in Forge's own container - no separate builder container, no `docker.sock`, no SSH to a separate host. `flatpak`/`flatpak-builder`/`ostree`/`gnupg2` are installed straight into Forge's own image (see `Dockerfile`). Both submission types converge into the same run:

- **BUNDLE** (a developer uploaded a prebuilt `.flatpak`): curls the bundle and imports it straight into the signed OSTree repo.
- **GIT** (a developer instead points at a repo + manifest): clones the repo, then runs `flatpak-builder --gpg-sign=...` straight into the same repo - building and signing in one step, no separate unsigned-bundle stage.

**Why not R2 mounted as a filesystem**: OSTree's commit writes rely on hardlinks (`linkat`) to dedupe content objects - a real, reproduced `error: Writing content object: renameat: Operation not permitted` confirmed rclone's FUSE mount (in any mode) doesn't support that against R2, a documented rclone limitation, not something a different mount flag fixes. `ostree pull-local` apparently doesn't hit this, but a fresh `flatpak-builder`/`build-import-bundle` commit does. The fix: the OSTree repo's real, working copy lives on a genuine local filesystem - a [Hetzner Volume](https://www.hetzner.com/storage/storage-volumes/) (or equivalent block storage - real ext4/xfs, full hardlink support, independently resizable, not tied to a VM's boot disk, since this repo is tens of GB and growing) mounted straight into the `app` service.

**Serving**: Forge itself serves the repo directly - `src/routes/flatpak/[...path]/+server.ts` reads straight off the same mount and serves it at `/flatpak/*` on Forge's own domain (e.g. `forge.blossomos.org/flatpak/`). No R2/CDN involved for Flatpaks at all: the R2 bucket previously used for this also hosts unrelated content (RPMs) that couldn't move, so Flatpaks moved off it instead of trying to share a domain. `src/lib/server/custom-repo.ts` (used for app-discovery dedup) reads the same mount directly via `fs.readdir` rather than an HTTP round trip to itself.

Neither BUNDLE nor GIT stages into a disposable repo before writing to the real one (explicit choice, matching the direct `flatpak-builder --gpg-sign=... --repo=... build-dir` style command this replaced) - a bundle's embedded app-id, or a manifest's declared one, could in principle still mismatch what the submission itself claims, and nothing catches that before it lands in the repo. GIT-submitted manifests also run arbitrary build commands (`flatpak-builder --install-deps-from=flathub`) directly in the same container that holds the GPG signing key and serves public traffic. Mandatory human review before a submission is ever approved is the only safeguard against either risk.

**Real, deliberate trade-off**: `app` needs `privileged: true` in `docker-compose.yml` - `flatpak-builder`'s own `bwrap` sandbox needs user/mount namespace capabilities a plain container doesn't get by default. This is a bigger surface than the old design's scoped SSH key or even a separate `docker exec`-reachable sibling container, since it's now the same container that serves public HTTP traffic. Accepted in exchange for dropping all the SSH/Docker-in-Docker machinery entirely.

One-time setup, in `docker-compose.yml`:

1. A block storage volume (e.g. a Hetzner Volume) attached and mounted on the host, then referenced by the `flatpak-repo` named volume's `driver_opts.device` - this is where the OSTree repo actually lives. If it's empty, it needs to be `ostree init --mode=archive-z2`'d once (`docker compose exec app ostree init --repo=/repo --mode=archive-z2`), same "Forge assumes it's already there" posture as the runtimes/tooling below.
2. `forge.blossomos.org` (or whatever domain fronts Forge) needs to actually route `/flatpak/*` to Forge rather than being intercepted by a CDN/reverse-proxy layer in front of it - it's a normal SvelteKit route, not a special CDN target.

The GPG signing key itself is uploaded in Infra Settings (paste the ASCII-armored private key), not assumed to already exist anywhere. Every publish/repair/unpublish run imports it fresh and derives its fingerprint straight from the key file, so losing this container's own keyring never means losing the signing key itself.

There's no queue/worker process behind Flatpak publishing, it's a fire-and-forget background task in the same server process. A detached run (`spawn` with `detached: true` + `unref()`, the Node equivalent of the old `screen -dmS`) keeps going independent of the specific request that launched it, so a Forge process-level restart mid-build doesn't lose it - see `pollBuildOnce`/`reconcileStuckBuilds` in `flatpak-publish.ts`. It does **not** survive the whole container being recreated (a redeploy, `docker compose down`/`up`), same trade-off the pipeline's original pre-Docker design always had - the row is left on `PROCESSING` and needs a manual retry from the Review page.

## API

See [API.md](./API.md) for the public HTTP API consumed by store clients.
