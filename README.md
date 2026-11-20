# Manchester Drive

Drive around a shared, pixel-art interpretation of the streets around Piccadilly Gardens. One Node process hosts the map for up to eight drivers. Cars, traffic signals and pedestrians are shared between browsers.

## Play

From this directory, use Node 22 or later. The server and client have no package dependencies.

```fish
npm start
```

Open [the game](http://127.0.0.1:4173) in two browser windows, enter different driver names and select **Drive** in each. Use **W** to accelerate, **S** to brake and then reverse, and **A/D** to steer. Touch devices have on-screen controls. **Leave car** frees your place in the room.

Brake lights brighten red as drivers slow down. NPCs hold them on while waiting at lights, in queues, or at a crossing. Hold **S** while moving forward to brake, then keep holding it to reverse with white rear lights.

For a clockwise lap, head east on Piccadilly and turn right at the lights onto Portland Street. Turn right onto Parker Street, pass the zebra crossing, and follow Mosley Street north. Turn right onto Piccadilly to return to the lights. Both directions are open to players.

## Race a lap

Two drivers select **Drive** in the same room. One selects **Open race** and the other selects **Join race**. Both cars move to a clear grid on Piccadilly near the Oldham Street lights. The three-second countdown ends together. Traffic, pedestrians and free-drivers stay on the road.

Cross the gold gates clockwise on Portland Street, Parker Street, Mosley Street and Piccadilly. The arrow points towards an off-screen gate. At the gate it shows the crossing direction. If you miss one, return and cross it in that direction. The chequered finish on Piccadilly counts after all four gates. Both racers see the server's finish order and lap times.

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

For a playtest, start together at the Oldham Street lights, split up around the gardens, and meet at the Parker Street zebra. Check that both drivers see the same pedestrian and waiting traffic. Watch the gap between queued cars at a red light. Tap a parked car, then try a faster bump and a glancing hit against a building. Check both views as one driver leaves and rejoins.

## Implementation

The server advances the world at 60 simulation steps per second and broadcasts snapshots over Server-Sent Events at 15 Hz. Each browser sends sequenced control changes over HTTP, predicts its own car between snapshots and interpolates other road users. A lost heartbeat releases the controls and eventually removes the car. The shared room lasts for the lifetime of the server.

The map is hand-drawn in canvas coordinates. Cars collide with rotated vehicle footprints, building outlines, pedestrians and the map edges. Vehicle impacts transfer momentum between cars. A glancing hit can push a car sideways or carry it along a wall while its tyres regain grip. NPCs brake for traffic ahead and leave a 12-pixel bumper gap when queuing. Through traffic follows left-hand lanes at the Oldham Street lights. Other cars circulate anticlockwise, indicate before each corner, yield at the Parker Street zebra, and give way when joining Portland Street.
