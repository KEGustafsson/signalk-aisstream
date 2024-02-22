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

Changes:
- v0.1.0, First working version
- v0.2.0, Socket reconnection fixed
- v0.3.0, WebSocket dependency added
- v0.4.0, AtoNs added
