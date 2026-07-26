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

| Variable                   | Description                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/forge`                                                                 |
| `BETTER_AUTH_SECRET`       | Random secret used to sign sessions                                                                                                              |
| `BETTER_AUTH_URL`          | Public URL of this app, e.g. `https://forge.example.com`                                                                                         |
| `AUTHENTIK_URL`            | Base URL of your Authentik instance, e.g. `https://auth.example.com`                                                                             |
| `AUTHENTIK_CLIENT_ID`      | OAuth client ID from the Authentik provider                                                                                                      |
| `AUTHENTIK_CLIENT_SECRET`  | OAuth client secret from the Authentik provider                                                                                                  |
| `BUNNYCDN_PASSWORD`        | FTP password for the BunnyCDN storage zone used for uploads                                                                                      |
| `FORGE_SECRETS_KEY`        | Encrypts the Flatpak publish pipeline's SSH key/GPG passphrase at rest in Postgres. Keep distinct from `BETTER_AUTH_SECRET`                      |
| `FLATPAK_MAX_BUNDLE_BYTES` | Max accepted `.flatpak` upload size in bytes (default 2 GiB)                                                                                     |

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
- **Review**: available to `staff` and `forge-reviewer` groups. Approving a PWA just flips its status. Approving a Flatpak is different: it flips to `PROCESSING` and asynchronously SSHes into the configured remote host to import the bundle into the signed OSTree repo, splice in AppStream metadata generated from the submission, and republish. Only a successful build is marked `APPROVED`; a failed one is marked `FAILED` with the build log visible to reviewers, retryable in place. A rejection note is shown to the submitter either way.
- **Infra Settings**: `admin`-only (a group independent of `staff`/`forge-reviewer`, scoped narrowly to this page). Generates the SSH keypair Forge uses to reach the Flatpak repo host (only the public key is ever shown, copy it into `authorized_keys` there) and sets the GPG passphrase used to sign commits during publish. Both are encrypted at rest in Postgres via `FORGE_SECRETS_KEY`.
- **Whitelist**: manage the Lutris game whitelist. `staff` only.
- **Front Page**: visual block editor for the store's home page (type `/` anywhere to insert blocks). `staff` only.

Roles are synced from the Authentik `groups` claim on every sign-in and are not user-editable through the app; they're only ever written by the server after verifying the OIDC token.

## Flatpak publishing

Approving a Flatpak submission runs a generated script over SSH on the configured remote host (default `repo.blossomos.org`, configurable in Infra Settings). Before that can work, two one-time things need to be set up **on the remote host itself**. Forge doesn't and can't automate these:

1. Generate an SSH key in Infra Settings, then add the displayed public key to that host's `authorized_keys` for the account configured as the SSH user (`remoteUser` in Infra Settings, default `forge`).
2. Enable headless GPG signing: add `allow-preset-passphrase` to that account's `gpg-agent.conf` so the publish script can seed the passphrase into the agent without an interactive prompt **and then reload the agent** (`gpgconf --reload gpg-agent`, or kill it so the next call spawns fresh). A running agent won't pick up the config change on its own; skipping this step produces `gpg-preset-passphrase: caching passphrase failed: Not supported`.

The GPG signing key ID itself is never configured in Forge, the publish script derives it the same way this project's existing tooling always has: `gpg --list-secret-keys --keyid-format LONG | awk '/sec/ {print $2}' | cut -d/ -f2` on the remote host.

There's no queue/worker process behind Flatpak publishing, it's a fire-and-forget background task in the same server process. If the app restarts mid-build, the row is left on `PROCESSING` and needs a manual retry from the Review page; this is a deliberate trade-off to avoid adding a full job queue for what's expected to be low-volume.

## API

See [API.md](./API.md) for the public HTTP API consumed by store clients.
