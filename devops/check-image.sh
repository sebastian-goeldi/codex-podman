#!/bin/sh
set -eu

# Exercise nested image volumes with the same home mount and user as the
# launcher. Host packages, PID records and sockets must not leak into them.
image="${1:-codex:latest}"
task_home=$(mktemp -d)
trap 'rm -rf "$task_home"' EXIT
mkdir -p "$task_home/packages/standalone"
touch "$task_home/host-settings" "$task_home/packages/standalone/host-package"
ln -s host-package "$task_home/packages/standalone/current"
mkdir -p "$task_home/app-server-daemon" "$task_home/app-server-control"
printf '%s\n' '{"pid":1,"processStartTime":"stale host process"}' > "$task_home/app-server-daemon/app-server.pid"
touch "$task_home/app-server-control/app-server-control.sock"

podman run --rm \
	--user codex \
	--userns=keep-id \
	-v "$task_home:/home/codex/.codex" \
	--entrypoint /bin/sh \
	"$image" -eu -c '
	package=/home/codex/.codex/packages/standalone/current
	test -f /home/codex/.codex/host-settings
	test ! -e /home/codex/.codex/packages/standalone/host-package
	test ! -e /home/codex/.codex/app-server-daemon/app-server.pid
	test ! -e /home/codex/.codex/app-server-control/app-server-control.sock
	test -L /home/codex/.local/bin/codex
	test "$(readlink -f /home/codex/.local/bin/codex)" = "$(readlink -f "$package/codex")"
	test -f "$package/codex-package.json"
	test -x "$package/bin/codex-code-mode-host"
	test -x "$package/codex-path/rg"
	test -x "$package/codex-resources/bwrap"
	/home/codex/.local/bin/codex --version
	"$package/codex" --version
	# The PID backend needs procps with both stat and lstart output columns.
	ps -p "$$" -o stat= -o lstart=
	trap "codex app-server daemon stop" EXIT
	codex app-server daemon start
	codex app-server daemon version
	test -S /home/codex/.codex/app-server-control/app-server-control.sock
	'

test -f "$task_home/packages/standalone/host-package"
test "$(readlink "$task_home/packages/standalone/current")" = host-package
test "$(cat "$task_home/app-server-daemon/app-server.pid")" = '{"pid":1,"processStartTime":"stale host process"}'
test -f "$task_home/app-server-control/app-server-control.sock"
test ! -e "$task_home/app-server-daemon/settings.json"
printf '%s\n' 'Codex package and daemon work with a host home mounted; host daemon state is unchanged.'
