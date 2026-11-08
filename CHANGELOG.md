# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Fixed

- Use the AIS report time (`MetaData.time_utc`) as the delta update timestamp instead of the local receipt time, so delayed AISStream data no longer looks newer than local AIS sources in Signal K source arbitration. Falls back to receipt time when `time_utc` is missing or invalid.
- Messages with a missing or unparseable `time_utc` no longer throw; they are delivered without `navigation.datetime` and ETA.

## [0.9.1] - 2026-08-07

### Changed

- Updated README documentation for the configuration screenshot and Node.js requirement.
- Bumped package version for the documentation and metadata update.

## [0.9.0] - 2026-08-07

### Added

- Added Signal K App Store screenshot metadata for the plugin configuration screen.
- Added Signal K reusable plugin CI workflow coverage.

### Fixed

- Ignore AIS true heading values outside the valid 0-359 degree range.

## [0.8.0] - 2026-04-25

### Fixed

- Guard position subscription delta handling.

## [0.7.2] - 2026-04-01

### Fixed

- Dynamic reconnection at startup.

## [0.7.1] - 2025-10-13

### Fixed

- WebSocket startup fix.

## [0.7.0] - 2025-10-13

### Changed

- Migrated to TypeScript with modular architecture and unit tests.

### Fixed

- General bug fixes from the TypeScript migration.

## [0.6.5] - 2025-10-13

### Changed

- Released a new package version.

## [0.6.1] - 2025-10-13

### Fixed

- Fixed WebSocket startup delay and hanging connection timeout.

## [0.6.0] - 2025-10-13

### Added

- Added exponential backoff reconnect behavior.

### Fixed

- Fixed WebSocket behavior.

## [0.5.1] - 2025-10-13

### Fixed

- Fixed typo.

## [0.5.0] - 2025-10-13

### Changed

- Improved AIS AtoN and base station handling.

### Fixed

- Fixed AIS AtoN and base station handling issues.

## [0.4.3] - 2025-10-13

### Fixed

- Reset socket close handling.

## [0.4.2] - 2025-10-13

### Fixed

- Improved reconnection handling.

## [0.4.1] - 2025-10-13

### Fixed

- Fixed context typo.

## [0.4.0] - 2025-10-13

### Added

- Added AIS AtoN support.

## [0.3.0] - 2025-10-13

### Added

- Added WebSocket dependency.

## [0.2.0] - 2025-10-13

### Fixed

- Fixed socket reconnection.

## [0.1.0] - 2025-10-13

### Added

- First working version.
