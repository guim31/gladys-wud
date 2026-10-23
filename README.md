# What's Up Docker for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com/) integration for
[What's Up Docker](https://getwud.github.io/wud/) (WUD): the updates WUD found
for your Docker containers, in Gladys. Read-only: it never updates a container
and never runs a WUD trigger.

Tested against a real WUD 9.5.0 and 8.4.0 (Docker, watching an isolated Docker
daemon); feedback welcome on [the issues](https://github.com/guim31/gladys-wud/issues).

## Features

- **What's Up Docker device**: reachable, watched containers, updates
  available, major updates, last update found.
- **One device per container you choose** (names in the configuration, or `*`):
  update available, current version, new version. A container is recognised by
  its name and WUD watcher, so recreating it to update it keeps the device.
- **Scene triggers**: "Container update available" (once per version, filters
  on the container and the kind: major, minor, patch, digest, other; variables
  container, image, current and new version, kind) and "Container update
  applied" (the container runs a new image, no update left).
- **Scene action**: "Check for container updates", one container or all.
- **Dashboard widget** "Container updates": the containers with an update,
  majors first, and a "Check now" button.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- What's Up Docker 8 or 9 reachable from Gladys (port 3000 by default), with a
  user and password, or a WUD 9 API token (read scope; write for "Check now").

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-wud` (or
   install **What's Up Docker** from the catalog once it is listed).
2. In **Configuration**, enter the address of WUD (`http://192.168.1.2:3000`…),
   the user and password or the API token, and the names of the containers you
   want as devices. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every refresh interval (2 to 15 minutes, 5 by default) the integration reads
  `GET /api/containers`: one request, every watched container with its tag, the
  newer tag or digest WUD found and the kind of update. WUD queries the
  registries on its own schedule; the integration never forces a check, except
  on "Check now" (`POST /api/containers/watch?async=true`, or
  `POST /api/containers/<id>/watch`).
- What was last seen of each container is kept in `/data/wud-state.json`: an
  update found while Gladys or the integration restarted is still announced,
  once, and an update applied meanwhile is noticed. The first read after the
  installation records what is pending without announcing it.
- Devices are published with `should_poll: false`; the integration publishes
  only the states that change, and every state again every 12 hours.

## Limitations

- Read-only: no update, no restart, no WUD trigger.
- The WUD API has no "last check" date: the WUD device shows the date of the
  last update found instead.
- A snoozed update (WUD 9) disappears from the counters while snoozed, without
  firing "applied".
- For the state of the containers (running, CPU…), see
  [PhilippeMA/gladys-docker](https://github.com/PhilippeMA/gladys-docker) or
  [LM1LC3N7/gladys-portainer](https://github.com/LM1LC3N7/gladys-portainer);
  this integration only follows the image updates.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and an in-memory WUD shaped on the
real answers of `test/fixtures/wud/`. See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

## Credits

- [What's Up Docker](https://github.com/getwud/wud) by fmartinou and
  contributors (MIT): the API this integration reads. The cover uses the
  official WUD logo (`website/static/img/wud-logo.svg` of that repository, MIT).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and SDK.

## Disclaimer

This project is not affiliated with What's Up Docker, Docker Inc. or their
authors. Docker is a trademark of Docker, Inc.

## License

[Apache-2.0](LICENSE)
