#!/bin/sh
CONTAINER=$(buildah from docker.io/debian:stable-slim)
CODEX_VERSION=1.0
IMAGE=codex

buildah run "$CONTAINER" sh <<'EOT'
	export DEBIAN_FRONTEND=noninteractive
	apt-key adv --keyserver keyserver.ubuntu.com --recv-key C99B11DEB97541F0
  apt-add-repository https://cli.github.com/packages
	apt-get update
	apt-get install -y bash coreutils curl sudo adduser net-tools git build-essential graphviz graphviz-dev gcc g++ gh
	apt-get clean
	find / -type f -name '*.md' -delete 2>/dev/null
	adduser --disabled-password --gecos "" codex
	mkdir -p /home/codex/.codex
	echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/codex/.bashrc
	mkdir -p /home/codex/.local/bin
	chown -R codex:codex /home/codex
	sudo -u codex -i bash -c 'export CODEX_NON_INTERACTIVE=1; curl -fsSL https://chatgpt.com/codex/install.sh | sh'
	cp -rL /home/codex/.codex/packages/standalone/current/bin/* /home/codex/.local/bin/
	sudo -u codex -i bash -c 'curl -LsSf https://astral.sh/uv/install.sh | bash'
EOT

buildah config \
	--author "Sebastian Goeldi" \
	--env "PATH=/home/codex/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
	--env "SHELL=/bin/bash" \
	--env "DISABLE_TELEMETRY=1" \
	--env "DISABLE_AUTOUPDATER=1" \
	--env "OPENBLAS_NUM_THREADS=1" \
	--env "OMP_NUM_THREADS=1" \
	--env "MKL_NUM_THREADS=1" \
	--cmd "[]" \
	--entrypoint '[ "/home/codex/.local/bin/codex" ]' \
	--annotation "com.openai.codex.version=$CODEX_VERSION" \
	--annotation "org.opencontainers.image.title=codex" \
	--annotation "org.opencontainers.image.description=OpenAI Codex CLI on Debian ready for rootless podman" \
	--annotation "org.opencontainers.image.url=https://github.com/sebastian-goeldi/codex-podman" \
	--annotation "org.opencontainers.image.source=https://github.com/sebastian-goeldi/codex-podman" \
	--annotation "org.opencontainers.image.documentation=https://github.com/sebastian-goeldi/codex-podman/blob/main/README.md" \
	--annotation "org.opencontainers.image.license=AGPL-3.0-or-later" \
	--annotation "org.opencontainers.image.created=$(date --iso-8601=seconds)" \
	"$CONTAINER"

buildah commit \
	--rm \
	"$CONTAINER" "$IMAGE"

buildah tag "$IMAGE" "${IMAGE}:${CODEX_VERSION}"

echo "Done!"
echo "${IMAGE}:${CODEX_VERSION}"
echo "To use this image run /bin/codex"
