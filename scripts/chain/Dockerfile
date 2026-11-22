# syntax=docker/dockerfile:1.7
# One build RUN avoids large toolchain snapshots with Docker's VFS driver.
# Toolchains/cargo state live in BuildKit cache mounts; the result exports only SBF.
FROM --platform=linux/amd64 rust:1.100.0-slim-bookworm AS build
SHELL ["/bin/bash", "-e", "-o", "pipefail", "-c"]
RUN --mount=type=secret,id=brim_ca \
    --mount=type=bind,source=.,target=/source,readonly \
    --mount=type=cache,target=/opt/brim-tools \
    --mount=type=cache,target=/root/.cache/solana \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/chain-target \
    source /source/scripts/chain/toolchain.env; \
    apt_options=(); curl_options=(--fail --location --retry 3); \
    if [ -s /run/secrets/brim_ca ]; then \
      apt_options+=(-o Acquire::https::CaInfo=/run/secrets/brim_ca); \
      curl_options+=(--cacert /run/secrets/brim_ca); \
      export CARGO_HTTP_CAINFO=/run/secrets/brim_ca SSL_CERT_FILE=/run/secrets/brim_ca; \
    fi; \
    apt-get "${apt_options[@]}" update && \
    apt-get "${apt_options[@]}" install -y --no-install-recommends \
      ca-certificates curl bzip2 pkg-config libssl-dev libudev-dev clang; \
    agave_dir="/opt/brim-tools/agave/${AGAVE_VERSION}"; \
    if [ "$(cat "$agave_dir/.verified-sha256" 2>/dev/null || true)" != "$AGAVE_SHA256" ]; then \
      curl "${curl_options[@]}" \
        "https://github.com/anza-xyz/agave/releases/download/v${AGAVE_VERSION}/solana-release-x86_64-unknown-linux-gnu.tar.bz2" \
        --output /tmp/agave.tar.bz2; \
      echo "${AGAVE_SHA256}  /tmp/agave.tar.bz2" | sha256sum --check --strict; \
      rm -rf "$agave_dir"; mkdir -p "$agave_dir"; \
      tar -xjf /tmp/agave.tar.bz2 -C "$agave_dir" --strip-components=1; \
      printf '%s' "$AGAVE_SHA256" > "$agave_dir/.verified-sha256"; \
      rm /tmp/agave.tar.bz2; \
    fi; \
    platform_dir="/root/.cache/solana/${PLATFORM_TOOLS_VERSION}/platform-tools"; \
    if [ "$(cat "$platform_dir/.verified-sha256" 2>/dev/null || true)" != "$PLATFORM_TOOLS_SHA256" ]; then \
      curl "${curl_options[@]}" \
        "https://github.com/anza-xyz/platform-tools/releases/download/${PLATFORM_TOOLS_VERSION}/platform-tools-linux-x86_64.tar.bz2" \
        --output /tmp/platform-tools.tar.bz2; \
      echo "${PLATFORM_TOOLS_SHA256}  /tmp/platform-tools.tar.bz2" | sha256sum --check --strict; \
      rm -rf "$platform_dir"; mkdir -p "$platform_dir"; \
      tar -xjf /tmp/platform-tools.tar.bz2 -C "$platform_dir"; \
      printf '%s' "$PLATFORM_TOOLS_SHA256" > "$platform_dir/.verified-sha256"; \
      rm /tmp/platform-tools.tar.bz2; \
    fi; \
    export PATH="$agave_dir/bin:$PATH" CARGO_TARGET_DIR=/chain-target; \
    cd /source; \
    cargo-build-sbf --manifest-path programs/brim/Cargo.toml \
      --tools-version "$PLATFORM_TOOLS_VERSION" --arch v3 --features devnet \
      --skip-tools-install --sbf-out-dir /artifacts -- --locked; \
    rm -rf /var/lib/apt/lists/*

FROM scratch AS artifact
COPY --from=build /artifacts/brim.so /brim.so
