# Manchester Drive

Drive through Piccadilly Gardens and several blocks of the Northern Quarter on streets drawn from OpenStreetMap. One Node process hosts the map for up to eight drivers. Cars, traffic signals and pedestrians are shared between browsers.

## Play

From this directory, use Node 22 or later. The server and client have no package dependencies.

```fish
npm start
```

Open [the game](http://127.0.0.1:4173) in two browser windows, enter different driver names and select **Drive** in each. Use **W** to accelerate, **S** to brake and then reverse, and **A/D** to steer. Touch devices have on-screen controls. **Leave car** frees your place in the room.

Brake lights brighten red as drivers slow down. NPCs hold them on while waiting at lights, in queues, or at a crossing. Hold **S** while moving forward to brake, then keep holding it to reverse with white rear lights.

From the starting bays on Piccadilly, turn left onto Lever Street. Continue past Dale Street and Stevenson Square, then turn left onto Faraday Street. Take Spear Street to Hilton Street and return down Oldham Street to Piccadilly.

## Race a lap

Two drivers select **Drive** in the same room. One selects **Open race** and the other selects **Join race**. Both cars move to a clear grid on Piccadilly beside the gardens. The three-second countdown ends together. Traffic, pedestrians and free-drivers stay on the road.

Follow the dotted racing line and cross the gold gates on Lever Street, Faraday Street, Hilton Street and Oldham Street. The arrow points towards an off-screen gate. At the gate it shows the crossing direction. If you miss one, return and cross it in that direction. The chequered finish on Piccadilly counts after all four gates. Both racers see the server's finish order and lap times.

Use **Leave race** to return to free driving. Before the start, the other driver can wait for a replacement. After the start, withdrawing or disconnecting records a DNF. Select **Race again** to open another race.

For two devices on the same local network, start a LAN-accessible room on port 4174.

```fish
env HOST=0.0.0.0 PORT=4174 npm start
```

Both drivers open the host computer's LAN address on port 4174. Set `PORT` to use a different port. The default bind address is loopback. Stop the server with Ctrl-C.

## Verify

```fish
npm test
```

The tests cover driving and reversing, collisions and recovery, clear spawns, traffic signals, pedestrian crossings, full driving laps, turning traffic, race staging, directional checkpoints, finish order and two clients observing the same server state.

For a playtest, start together on Piccadilly, split up at Lever Street and meet at its crossing near Dale Street. Check that both drivers see the same pedestrian and waiting traffic. Watch the gap between queued cars at a red light. Tap a parked car, then try a faster bump and a glancing hit against a building. Check both views as one driver leaves and rejoins.

## Implementation

The server advances the world at 60 simulation steps per second and broadcasts snapshots over Server-Sent Events at 15 Hz. Each browser sends sequenced control changes over HTTP, predicts its own car between snapshots and interpolates other road users. A lost heartbeat releases the controls and eventually removes the car. The shared room lasts for the lifetime of the server.

Cars collide with the edges of mapped building footprints, other vehicles, pedestrians and the edge of the playable area. Traffic follows two connected circuits, brakes for queues and crossings, and indicates before turning. Signal timings and lane positions are game approximations. Free driving allows either direction. The race and both traffic routes follow mapped motorcar access and one-way directions.

## Map data

The bundled map covers approximately 550 by 545 metres, north up, at five game pixels per metre. Roads, building outlines, trees, paths and tram tracks come from a local OpenStreetMap extract retrieved on 20 November 2026. Where a road lacks a mapped width, the importer estimates it from the lane count or street type. Both the browser and server read the same asset. Playing requires no map service or API key.

Map data © OpenStreetMap contributors. The derived database is distributed under the Open Database License 1.0 in [public/manchester-map.js](public/manchester-map.js). [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/)

To refresh the map, download the surrounding area and run the importer with Python 3.9 or later. The download includes a margin so that buildings and streets crossing the playable boundary have complete geometry.

```fish
curl --fail --location 'https://api.openstreetmap.org/api/0.6/map?bbox=-2.2428,53.4790,-2.2314,53.4865' -o /tmp/manchester-centre.osm
python3 scripts/import-map.py /tmp/manchester-centre.osm
npm test
```

The importer checks that the selected route ways connect and permit travel in the chosen direction. If a mapper splits a way or changes access, review the affected legs before refreshing the bundled map.
