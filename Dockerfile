FROM denoland/deno:latest AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 && rm -rf /var/lib/apt/lists/*

COPY package.json deno.lock* deno.json* vite.config.ts .svelte-kit/tsconfig.json ./

RUN deno install

COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/forge"
RUN deno x prisma generate
RUN deno task build

FROM denoland/deno:latest AS runner

# flatpak/flatpak-builder/ostree/gnupg2 (bubblewrap comes in as
# flatpak-builder's own dependency) - Forge builds/signs/publishes Flatpaks
# as plain subprocesses of its own server process now, see
# src/lib/server/flatpak-publish.ts. No separate container, no docker.sock -
# this container already IS the isolation boundary. Needs `privileged: true`
# in docker-compose.yml for flatpak-builder's bwrap sandbox to work (user/mount
# namespaces) - see that file's comment for the trade-off this implies now
# that it's the same container serving public HTTP traffic.
RUN apt-get update && apt-get install -y --no-install-recommends curl git ca-certificates flatpak flatpak-builder ostree gnupg2 && update-ca-certificates && rm -rf /var/lib/apt/lists/*

# Headless GPG signing needs the agent to accept a preset passphrase rather
# than prompting interactively - baked into the image so there's nothing to
# configure/reload at runtime, same posture the old external build image had.
RUN mkdir -p /root/.gnupg && chmod 700 /root/.gnupg && echo 'allow-preset-passphrase' > /root/.gnupg/gpg-agent.conf

# flatpak-builder's --install-deps-from=flathub (see buildGitBuildSection in
# flatpak-publish.ts) needs this remote already added - system-wide, not
# per-user, since the publish scripts run as root.
RUN flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/deno.lock* ./
COPY --from=builder /app/deno.json* ./

RUN deno install

EXPOSE 3000

CMD ["sh", "-c", "deno x prisma migrate deploy && deno run --allow-net --allow-env --allow-read --allow-run --allow-write --allow-sys build/index.js"]
