# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores in Gladys the address of What's Up Docker and its
credentials (user and password, or API token: secret fields, never logged).
Under `/data` it keeps only `wud-state.json`: the names, versions and image ids
of the containers WUD watches, and the updates already announced. It talks to
What's Up Docker only, on the local network, and only reads, except "Check now"
(a check of the registries by WUD, never an update of a container). It never
connects to Docker itself.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
What's Up Docker, and the registries it queries.
