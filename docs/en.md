# What's Up Docker

[What's Up Docker](https://getwud.github.io/wud/) (WUD) is a free,
self-hosted tool that watches your Docker containers and tells you when a newer
version of their image is published. This integration brings what WUD found
into Gladys: a What's Up Docker device (reachable, containers watched, updates
available, major updates), one device per container you choose (update
available, current version, new version), scenes that start when an update is
found or applied, and a dashboard widget listing the containers to update.

The integration is **read-only**: it never updates a container and never runs a
WUD trigger. Updating stays your call, in WUD or by hand.

Tested against a real WUD 9.5.0 and 8.4.0 (Docker, watching an isolated
Docker daemon); not yet on every setup: feedback welcome on
[the issues](https://github.com/guim31/gladys-wud/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- What's Up Docker 8 or 9, reachable from the Gladys machine (port 3000 by
  default).
- With WUD 9 (authentication is mandatory): a user and password, or better an
  API token. With WUD 8: the user and password if you enabled authentication,
  nothing otherwise.

WUD checks the registries itself, on its own schedule (every hour by default):
Gladys only reads what it found, every 5 minutes by default, and only asks for a
check when you press "Check now" or a scene does.

## Getting started

### 1. Create an API token (WUD 9)

In WUD, open your profile, then **API tokens**, and create a token. The
**read** scope is enough to follow the updates; add **write** for "Check now".
You can also use a user and its password instead.

### 2. Configure the integration

In Gladys, open **Integrations → What's Up Docker → Configuration**:

- **WUD address**: the address you open WUD with, e.g.
  `http://192.168.1.2:3000`.
- **User** and **Password**, or **API token (WUD 9)**: the token wins when both
  are filled in.
- **Containers as devices**: the names of the containers you want as Gladys
  devices, separated by commas (e.g. `gladys, zigbee2mqtt`), or `*` for all of
  them. Empty: only the What's Up Docker device. The scene triggers and the
  widget cover every container anyway.
- **Refresh interval**: 2, 5, 10 or 15 minutes.
- **Accept self-signed certificates**: only for an `https://` address with a
  home-made certificate.
- **Language of the names**: the language of the feature names and of the
  messages (French by default).

Save, then use **Test the connection**: it answers with the version of WUD, the
number of containers and of updates.

### 3. Add the devices

Open the **Discover** tab of the integration and add the devices you want.

## The devices

**What's Up Docker** (the server):

- **Reachable**: 1 while WUD answers, 0 otherwise.
- **Watched containers**: the containers WUD watches.
- **Updates available**: the containers with a newer image.
- **Major updates**: among them, the major ones (e.g. 7.x → 8.x).
- **Last update found**: the date the integration last saw a new update (the
  WUD API gives no "last check" date).

**One device per chosen container** (named after the container, its image as
model):

- **Update available**: 1 while WUD has an update for it.
- **Current version**: the tag it runs, e.g. `1.25.0` (and the short digest
  for a moving tag such as `latest`).
- **New version**: the newer tag WUD found, or "Up to date".

A container is recognised by its name and its WUD watcher, not by its Docker
id: a container recreated to update it stays the same device.

## Dashboard

The **Container updates** widget shows the number of updates and of major ones,
then the containers with an update, majors first: name, current → new version
and a badge (Major, Minor, Patch, Digest). A tap shows the image and, when WUD
knows it, a link to the release notes. When there is none: "Up to date". The
**Check now** button asks WUD to check every container (WUD 9 answers in the
background, the widget follows within a minute).

## Scenes

### Triggers

- **Container update available**: WUD found a new version of the image of a
  container. Announced once per version, for every container (added as a
  device or not). Filters: the container, the kind of update (major, minor,
  patch, digest of the same tag, other). Variables: container, image, current
  version, new version, kind of update.
- **Container update applied**: a container that had an update now runs a new
  image and has no update left. Variables: container, image, version, previous
  version.

A snoozed update (WUD 9) is not seen as applied, and comes back without being
announced twice.

### Actions

- **Check for container updates**: WUD asks the registries again now, for one
  container or all of them (empty field, or the What's Up Docker device). It
  never updates a container. Output: the number of containers checked. Needs
  the write scope with an API token.

### Scene ideas

- Every Sunday at 10:00, **Check for container updates**, then send a message
  with `[Updates available]` if it is above 0.
- **Container update available**, kind **Major**: send yourself a message
  "`container`: `current_version` → `new_version`, read the release notes
  before updating".
- **Container update applied** on the `gladys` container: send a message "Gladys
  updated to `version`".

## Troubleshooting

- **"What's Up Docker does not answer"**: check the address and the port (3000
  by default), and that the Gladys machine can reach it.
- **"WUD asks for a user and password, or an API token"**: WUD 9 always needs
  credentials; fill in the user and password, or a token.
- **"user, password or token refused by WUD"**: copy the token again, or check
  the password (an OIDC user cannot use basic authentication: use a token).
- **"check refused: the WUD user or token is read-only"**: give the token the
  write scope, or use a user with the rw or admin role.
- **"the address redirects"**: enter the `https://` address.
- **A container is missing from the devices**: check its exact name in WUD (the
  container name, not the image), and that WUD watches it (label
  `wud.watch=true` when `WUD_WATCHER_{name}_WATCHBYDEFAULT=false`).
- **No update for a `latest` tag**: WUD only follows the digest of a moving tag
  when digest watching is enabled (label `wud.watch.digest=true`).

## Limits

- Read-only: no update, no restart, no WUD trigger.
- The first read after the installation only records the updates already
  pending: they are not announced, the next ones are.
- An update is noticed at the next read (5 minutes by default) after WUD found
  it, which itself depends on the WUD schedule.
- Containers seen by WUD only: a container excluded from WUD does not exist for
  the integration.
- For the state of the containers (running, stopped, CPU), see the Docker
  integrations of the store, such as
  [gladys-docker](https://github.com/PhilippeMA/gladys-docker) or
  [gladys-portainer](https://github.com/LM1LC3N7/gladys-portainer).
