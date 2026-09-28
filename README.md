codex-podman
====

Codex for the security-conscious: run [OpenAI Codex CLI](https://github.com/openai/codex) in a rootless [podman](https://podman.io/) container.

Installation
----

First, download and install podman. Installation is easy and secure with curl

```sh
curl --proto '=https' --tlsv1.2 -sSf \
  https://raw.githubusercontent.com/sebastian-goeldi/codex-podman/refs/heads/main/bin/codex |
  tee $HOME/.local/bin/codex-podman
chmod a+x $HOME/.local/bin/codex-podman
```

Now you can just run `codex-podman`.

Make sure `OPENAI_API_KEY` is set in your environment — the wrapper passes it into the container.

Benefits
----

This provides the following benefits:

* Codex only gets file access to
	* Files in the present working directory
	* `$HOME/.codex`
* Codex can only execute the files that exist in the image.

This image runs in rootless podman, and even inside rootless podman it runs as
a non-root user inside the container.

The complete Codex installation lives in an anonymous
[image volume](https://docs.podman.io/en/latest/markdown/podman-run.1.html#image-volume-anonymous-tmpfs-ignore) at
`/home/codex/.codex/packages/standalone`. Podman populates it from the image, so
mounting your host's `~/.codex` does not hide the installation needed by
`codex remote-control start`. Your settings and sessions still use the host
directory. The daemon's `app-server-daemon` and `app-server-control` directories
also use anonymous volumes, so PID files and sockets from the host or another
container cannot interfere with startup. These volumes are removed with the
container by `--rm`.

Building locally
----

With Buildah and Podman installed, rebuild and check the package layout and
local daemon startup:

```sh
sh devops/build-image.sh
sh devops/check-image.sh
./bin/codex --local
```

Remote mode
----

Start a session on a daemon with remote control enabled:

```sh
codex-podman --remote
# Use your rebuilt local image:
./bin/codex --local --remote
```

The wrapper runs any initialization scripts, starts `codex remote-control start`,
and connects the terminal to that daemon with `codex --remote unix://`.
Startup errors appear in the terminal. Exiting the terminal session stops the
container and its daemon.

Put wrapper options first; remaining arguments are forwarded to the terminal
session, for example `./bin/codex --local --remote resume --last`.
Use `--` to pass Codex options that overlap with wrapper options:

```sh
./bin/codex --local -- --remote ws://HOST:PORT
```

Remote mode requires a ChatGPT login and workspace access to remote control.
It enables the CLI's experimental remote-control service.

Run the wrapper checks without Podman using Node.js:

```sh
node --test devops/check-wrapper.cjs
```

Customizing the runtime
----

Need to add packages to the container, or run an init script? no problem

```
--apk-packages foo,bar,baz # adds packages foo, bar, baz
--init-script  ./foobar.sh # copies foobar.sh into the container and executes it as root
```


For example, let's say you're using kubernetes and you do want codex to be able to troubleshoot it.

```sh
codex-podman \
	--apk-packages kubectl \
	--podman-arg "-v $HOME/.kube/config:/home/codex/.kube/config"
```
