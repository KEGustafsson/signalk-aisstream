# signalk-aisstream
[![npm version](https://badge.fury.io/js/signalk-aisstream.svg)](https://badge.fury.io/js/signalk-aisstream)

SignalK plugin to track the worlds vessels via websocket.
- Easy to configure and use.
- Using data source from https://aisstream.io/

## Steps to take plugin in use
1) Create account: https://aisstream.io/authenticate
2) API Keys -> Create New API Key
3) Copy your key
4) Install and configure signalk-aisstream plugin

## Plugin Config
1) Paste your key
2) Define bounding box size around the vessel
3) Define procentual value of movement compared to bounding box size, before bounding box location is renewed
4) Define refresh rate of own vessel location check 
5) Select Reports

## Data source coverage
https://aisstream.io/coverage

## AisStream.io documentation
https://aisstream.io/documentation

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
npm install
```

### Build
```bash
npm run build
```
This cleans the `dist/` directory and compiles TypeScript to JavaScript.

### Test
```bash
npm test
```

### Project Structure
```
src/
  index.ts                  # Plugin entry point
  ais-processor.ts          # AIS message processing and SignalK delta building
  websocket-manager.ts      # WebSocket connection lifecycle management
  lookups.ts                # AIS lookup tables (nav status, vessel types, AtoN types)
  types/
    aisstream.ts            # AIS wire-format interfaces (PascalCase JSON)
    signalk.ts              # SignalK app, plugin, delta types
    nmea0183-utilities.d.ts # Type declaration for untyped dependency
test/
  ais-processor.test.ts     # Message processing tests
  lookups.test.ts           # Lookup table tests
  fixtures/
    messages.ts             # Typed test fixtures for all AIS message types
```

## Changes
- v0.7.0, Migrated to TypeScript, modular architecture, unit tests, and bug fixes
- v0.6.5, new version
- v0.6.1, fix: webSocket startup delay and hanging connection timeout
- v0.6.0, fix: webSocket, add exponential backoff reconnect
- v0.5.1, typo fix
- v0.5.0, ATON & BASE Station improvements/fixes
- v0.4.3, reset socket close
- v0.4.2, reconnection improved
- v0.4.1, context typo fix
- v0.4.0, AtoNs added
- v0.3.0, WebSocket dependency added
- v0.2.0, Socket reconnection fixed
- v0.1.0, First working version
