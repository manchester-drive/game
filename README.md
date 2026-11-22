# Manchester Drive

Start at Piccadilly Gardens or another area of Greater Manchester and explore the streets of Manchester and Ashton-under-Lyne using OpenStreetMap data. One Bun process hosts a shared room with no fixed player limit. Drivers start on the clear street nearest their chosen area. Piccadilly starts in the usual bays.

## Play

Use Bun 1.4.4. From this directory, install the locked dependencies and start the game.

```fish
bun install --frozen-lockfile
bun start
```

Open [the game](http://127.0.0.1:4173) in two browser windows. Play as a guest or sign up, then select **Drive**. The hatchback has balanced handling and the panel van is longer with a wider turning circle. Use **W** to accelerate, **S** to brake and then reverse, and **A/D** to steer. Touch devices have on-screen controls. Stop and press **E** or select **Get out** to park. Walk with **WASD** or the on-screen arrows. The dashboard points back to your car. Stand beside either door and press **E** or tap the **Enter** button to drive. Each starting area has parked street vehicles, including hatchbacks, panel vans, sports coupés and black cabs. Walk up to one and the button names the vehicle you can enter. Your own car stays where you left it. When you get out of a borrowed vehicle or leave the game, anyone can drive it from that spot. Other players can see your character and parked car. **Leave game** removes your character and car from the room.

## Guests and accounts

Guests choose a name, a character, a starter car and a starting area each visit. Guest names show a **guest** tag above the car, in chat and on the world map, and cannot match a registered username. Guests save nothing on the server. The browser remembers their look and car.

Select **Sign up or log in** to keep a username, character, vehicles and starting area. A new account starts from the guest's current name, look and car, then walks through **Edit character**, **Your first car** and **Where to start**. Your username is your in-game and chat name. Only one car per account can be in the room; joining from a second tab replaces the first. There is no password reset yet.

**Edit character** picks a feminine or masculine figure, a hair style, and hair, skin, jacket and lower colours, including skirts. The figure only changes the sprite. **Your first car** picks the free hatchback or panel van with a paint, roof, stripe and a plate of up to seven characters shown on your name tag. Paint also colours your chat name. Each account gets one free starter. Returning players open **Garage** to choose which owned vehicle to drive and to repaint it for free. **Start** lets you choose from Piccadilly, Deansgate, Ancoats, the Etihad, Salford Quays, Old Trafford, Chorlton, Didsbury and Ashton-under-Lyne. Accounts also park: leaving the game, timing out, joining from another tab or a server restart saves where your active vehicle is, or where you left it if you were on foot. The server also saves it every 30 seconds while you play. Your next drive starts there, and the map shows **Your car** as a pin. If something now blocks the spot, you start on the nearest clear street. Picking an area instead applies to your next drive only. Each vehicle keeps its own spot, so switching cars in the garage takes you to that car.

## Explore

Select **Free cam** to explore before joining, while driving or on foot. Drag the map with a mouse or finger, or pan with **WASD** or the **arrow keys**. Press **Esc** or use the camera button to return. If you already have a car, it coasts while the camera is detached.

Select **World map** or press **M** to see everyone in the playable area. Arrows show drivers, dots show players on foot and a gold ring marks you. Select a marker to follow players, or explore with the **+** and **−** buttons, mouse wheel or pinch gesture. Drag to pan. Individual streets and their names appear as you zoom into a neighbourhood. **Whole region** restores the overview. **M**, **Esc** or **Close** returns to the game.

Tap or click a point in the playable area to set a private **GPS destination**. The blue line leads to the drivable road nearest the pin. While driving, the street display shows upcoming turns and distance remaining. GPS recalculates if you leave the route. Tap a new point to move the destination or select **Clear GPS** to end guidance.

Click the chat field or press **T** to type, **Enter** to send and **Esc** to return to the game. Press **Alt+Enter** (**Option+Return** on Mac) to switch between Global and Local during play or while typing. **Global** messages reach everyone, including spectators. The room keeps the most recent 50 global messages until the server restarts.

Choose **Local** to speak to players within 50 metres. Your message appears above your car or character for six seconds. Your newest message replaces your previous bubble. In free cam, hearing range still follows your player.

Brake lights brighten red as drivers slow down. NPCs hold them on while waiting at lights, in queues, or at a crossing. Hold **S** while moving forward to brake, then keep holding it to reverse with white rear lights.

From the starting bays on Piccadilly, turn left onto Lever Street. Continue past Dale Street and Stevenson Square, then turn left onto Faraday Street. Take Spear Street to Hilton Street and return down Oldham Street to Piccadilly.

## Race a lap

Two drivers select **Drive** in the same room. One selects **Open race** and the other selects **Join race**. Both cars move to a clear grid on Piccadilly beside the gardens. The three-second countdown ends together. Traffic, pedestrians and free-drivers stay on the road.

Follow the dotted racing line and cross the gold gates on Lever Street, Faraday Street, Hilton Street and Oldham Street. The arrow points towards an off-screen gate. At the gate it shows the crossing direction. If you miss one, return and cross it in that direction. The chequered finish on Piccadilly counts after all four gates. Both racers see the server's finish order and lap times.

Use **Leave race** to return to free driving. Before the start, the other driver can wait for a replacement. Getting out of the car also withdraws you. After the start, withdrawing or disconnecting records a DNF. Select **Race again** to open another race.

For two devices on the same local network, start a LAN-accessible room on port 4174.

```fish
env HOST=0.0.0.0 PORT=4174 bun start
```

Both drivers open the host computer's LAN address on port 4174. Set `PORT` to use a different port. The default bind address is loopback. Stop the server with Ctrl-C.

For development, `bun run dev` watches the server and client sources. For production, `bun run build` creates a standalone executable for the build platform at `dist/manchester-drive`. The Dockerfile builds the Linux executable for Fly.io. Both modes use the same `HOST` and `PORT` settings.

The server keeps accounts in SQLite at `DATABASE_PATH`, which defaults to `data/game.db`. Migrations run at startup. Passwords are hashed with argon2id, and login sets a 30-day `HttpOnly` session cookie whose SHA-256 is the only copy the database keeps. Failed logins are rate-limited in memory per IP and per username. The cookie is `Secure` over HTTPS and on loopback, so plain-HTTP LAN rooms still keep sessions. On Fly.io the database lives on a volume mounted at `/data`. Create the volume once before the first deploy and keep a single machine.

```fish
fly volumes create data --size 1 --region lhr
fly scale count 1
```

The container starts as root only to give the volume to the unprivileged user, then runs the server as that user.

Fly.io deploys are rolling, because the data volume attaches to one machine at a time. Fly sends the running server `SIGTERM`, then starts the new image on the same machine and waits for `/healthz`. The old server tells its viewers it is restarting, then closes their streams. The game is unavailable for a few seconds. Browsers keep retrying every second and reconnect once the new server is up. A browser that reaches a new build reloads the page. Drivers join again automatically, using the name, look and car kept in session storage. Accounts and their saved choices persist in SQLite. Positions, races and chat history do not carry over, because the room exists only in memory.

### Staging on Fly.io

Production uses `fly deploy` with `fly.toml`. The Alchemy staging stack has its own Fly app and SQLite volume in London. [Staging stack](infra/alchemy.run.ts)

From the repository root, create the staging app once in your Fly organization. Fly needs the app before it can accept an image into its registry.

```fish
fly apps create tombell-manchester-drive-stage --org YOUR_FLY_ORG
```

Build and push the image from the repository root. Fly's remote builder uses the existing Dockerfile and prints the image reference on the `image:` line.

```fish
fly deploy --app tombell-manchester-drive-stage --build-only --push --remote-only
```

Install the staging dependencies and configure Alchemy with a Fly organization token for the same organization. [Fly token setup](https://alchemy.run/fly/setup/)

```fish
cd infra
bun install --frozen-lockfile
bun alchemy profile edit --add Fly
```

Set `FLY_STAGING_IMAGE` to the full image reference from the build. Both deployment tags and SHA-256 digests work. On the first deployment, use `--adopt` to bring the bootstrapped App into the stack.

```fish
set -lx FLY_STAGING_IMAGE registry.fly.io/tombell-manchester-drive-stage:deployment-REPLACE_ME
bun alchemy plan --stage staging --adopt
bun alchemy deploy --stage staging --adopt
```

For later deploys, build a new image, update `FLY_STAGING_IMAGE` and run the same plan and deploy commands without `--adopt`. Keep `infra/.alchemy/` between deploys so Alchemy can track the Machine and disk. Destroying the stack also deletes the staging volume.

After the first deploy, check `/healthz` at the URL Alchemy prints, create a test account and join the same room from two browsers. Deploy a new image and check that the Machine and volume IDs are unchanged, the test account still works and both browsers reconnect.

## Verify

```fish
bun run typecheck
bun test
```

The tests cover signup, login, rate limits and session expiry, joining with a saved character and vehicle, reserved guest names, character fallbacks and sprites, the starter-only first car, starting areas, the garage, driving and reversing, collisions and recovery, clear spawns, traffic signals, pedestrian crossings, full driving laps, turning traffic, race staging, directional checkpoints, finish order and two clients observing the same server state.

For a playtest, leave one browser on Piccadilly and pan north in the other to watch traffic on Shudehill. Bring the cameras back together at the Lever Street crossing near Dale Street. Check that both drivers see the same pedestrian and waiting traffic. Watch the gap between queued cars at a red light. Tap a parked car, then try a faster bump and a glancing hit against a building. Check both views as one driver leaves and rejoins.

## Load testing

Run the dedicated fixture with `bun run load:server`. From a second terminal, run either scenario:

```fish
bun run load:test crowd 32 60
bun run load:test spread 32 60
```

The arguments select the layout, number of connected players and measurement duration in seconds. The fixture places drivers in clear mapped bays near Piccadilly or across eight locations. Each client reads its own event stream and sends driving or walking input. Some players park or use free cam. Collection starts after six seconds of warm-up.

For measurements across two private hosts, set `HOST` on the game host to its private bind address. Set `FIXTURE_URL` on the load generator to the game host's private control URL. The control port defaults to 4174 and the game port to 4173. Use the dedicated fixture on a private network. It includes benchmark controls and spawn placement that the deployed game does not expose.

The runner prints a JSON record with simulation rate, fixed-step processing time (including snapshot publication), peak game-process RSS, received SSE bandwidth, frames per client, input HTTP acknowledgement latency and failures. Timing excludes browser rendering. Run scenarios sequentially so the room is empty at the start of each run.

The London runs compared the two snapshot formats with players crowded around Piccadilly and spread across eight locations. [Load-test results](docs/load-test-2026-11-21.md)

## Implementation

The game runs as one Bun application. Its source is organised by responsibility.

| Directory | Responsibility |
| --- | --- |
| `src/client/` | Browser entry point, controls, camera, HUD, canvas rendering and network client |
| `src/game/` | World simulation, physics, races, character and vehicle catalogues, starting areas and the generated Manchester map shared by client and server |
| `src/protocol/` | Command schemas, join credentials and the world snapshot format |
| `src/server/` | The live game room, Hono command and account routes, SQLite storage and Bun HTTP and event-stream handling |

The HTTP routes validate incoming commands and pass them to the room. The room owns player sessions, input ordering and simulation time. It can run directly in a test with a controlled clock.

Players and nearby NPCs update at 60 Hz. Unobserved NPCs continue their routes at 10 Hz, with collision and crossing checks. The server targets 15 snapshots per second per browser over Server-Sent Events. Each snapshot includes the drivers, walkers, parked cars and NPCs near the camera and the driver. A player on foot also receives directions to their own parked car. The player count, races and chat are shared across the room. Each browser sends sequenced control changes over HTTP, predicts its own car between snapshots and interpolates other road users. A lost heartbeat releases the controls and eventually removes the car. The shared room lasts for the lifetime of the server.

Cars and walkers collide with buildings, vehicles, other players and the edge of the playable area. Cars also stop at the banks of mapped water and can cross it on road bridges. Tree trunks, bus stop poles, fingerposts, traffic lights, benches, fixed bollards, litter bins, pillar boxes and planters also have solid bases. You can pass under branches and behind signs. Traffic follows four mapped circuits across Piccadilly, Shudehill and the Northern Quarter, brakes for queues and crossings, and indicates before turning. Signal timings and lane positions are game approximations. Free driving allows either direction. The race and all traffic routes follow mapped motorcar access and one-way directions.

## Map data

The playable area covers about 261.8 km², with north up at five game pixels per metre. It includes the streets inside the M60, the motorway itself and a 5 km radius around Ashton-under-Lyne town centre. Traffic and the checkpoint race run around Piccadilly Gardens and the Northern Quarter.

Street geometry, buildings, paths, trees, tram tracks, parks and water come from OpenStreetMap. The importer keeps individual carriageways, motorway links and pedestrianised streets. It uses mapped widths where available and estimates the rest from lanes and street class. The renderer uses mapped road layers at bridges and tunnels. Driving physics remain two-dimensional.

The starting district is bundled with the game. Elsewhere the browser requests 288-metre map squares from the game server as you explore. The server uses the same squares for collisions. The production executable embeds the map and play requires no external map service or API key.

Map data © OpenStreetMap contributors. The derived database consists of the [starting district](src/game/manchester-map.ts) and the [regional archive, index, boundary, routing network and world map](src/game/map), distributed under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). [OpenStreetMap copyright](https://www.openstreetmap.org/copyright)

### Refresh the map

The central XML extract was retrieved on 20 November 2026. Its importer checks that selected race and traffic route ways connect and permit travel in the chosen direction. If a mapper splits a way or changes access, review the affected legs before refreshing.

```fish
python3 -m venv /tmp/manchester-map-tools
/tmp/manchester-map-tools/bin/pip install osmium==4.3.2 shapely==2.0.7
curl --fail --location 'https://api.openstreetmap.org/api/0.6/map?bbox=-2.2463,53.4760,-2.2262,53.4865' -o /tmp/manchester-centre.osm
/tmp/manchester-map-tools/bin/python scripts/import-map.py /tmp/manchester-centre.osm
```

The regional archive uses the 19 November 2026 OpenStreetMap snapshot. To refresh it, download Geofabrik’s Greater Manchester PBF and run the regional importer. Both importers use the Python environment above to cut drivable road surfaces out of the water polygons. [Geofabrik extract](https://download.geofabrik.de/europe/united-kingdom/england/greater-manchester/index.html)

```fish
curl --fail --location 'https://download.geofabrik.de/europe/united-kingdom/england/greater-manchester/greater-manchester-latest.osm.pbf' -o /tmp/greater-manchester.osm.pbf
/tmp/manchester-map-tools/bin/python scripts/import-region.py /tmp/greater-manchester.osm.pbf
bun test
```
