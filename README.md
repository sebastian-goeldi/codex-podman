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
a non-root user inside the container. Codex CLI is maximally locked down and
can't even update itself!

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
