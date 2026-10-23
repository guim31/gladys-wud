# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- What's Up Docker (WUD 8 and 9) in Gladys, read-only: a What's Up Docker
  device (reachable, watched containers, updates available, major updates,
  last update found) and, for the containers named in the configuration, one
  device each (update available, current version, new version).
- Scene triggers "Container update available" (once per version, filters on
  the container and the kind of update) and "Container update applied".
- Scene action "Check for container updates", for one container or all.
- Dashboard widget "Container updates": the containers with an update, majors
  first, and a "Check now" button.
- Authentication by user and password, or by a WUD 9 API token.
- Texts and documentation in English, French, German and Spanish.
