# Image used to build GIT-sourced Flatpak submissions in isolation from the
# GPG signing key - see buildDockerBuildScript/buildContainerScript in
# src/lib/server/flatpak-publish.ts. Never receives the signing key, R2
# credentials, or SSH access to the signing host: it only ever produces an
# unsigned bundle, which the signing host imports and signs afterward.
#
# Manual one-time prerequisites, not automated by Forge (same posture as the
# signing host's own prerequisites documented at the top of
# flatpak-publish.ts - Forge assumes infra like this already exists rather
# than provisioning it):
#   - build this image and make it available to the build host, e.g.
#       docker build -t ghcr.io/blossomos/forge-flatpak-builder:fedora44 .
#       docker push ghcr.io/blossomos/forge-flatpak-builder:fedora44
#     or `docker save`/`docker load` it directly onto the host for a
#     registry-less setup.
#   - `docker` itself (or a compatible CLI) must already be installed and
#     runnable by InfraSettings.buildUser on InfraSettings.buildHost.
#   - InfraSettings.buildDockerImage must reference whatever tag this image
#     was actually published under (defaults to the tag above).

FROM fedora:44

RUN dnf install -y --setopt=install_weak_deps=False \
        flatpak \
        flatpak-builder \
        git \
        git-lfs \
        ostree \
    && dnf clean all

# Needed so flatpak-builder's --install-deps-from=flathub (see
# buildContainerScript) can fetch whatever SDK/Platform runtime a submitted
# manifest declares - matches the "runtimes aren't preinstalled, they're
# fetched" posture the signing host already had for this, just moved here.
RUN flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
