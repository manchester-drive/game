import * as Fly from '@alchemy.run/fly';
import * as Alchemy from 'alchemy';
import * as Output from 'alchemy/Output';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';

const appName = 'tombell-manchester-drive-stage';
const port = 4173;

export default Alchemy.Stack(
  'ManchesterDriveStaging',
  { providers: Fly.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    if (stage !== 'staging') {
      return yield* Effect.die(new Error('Use --stage staging for the Manchester Drive stack.'));
    }

    const image = yield* Config.String('FLY_STAGING_IMAGE');
    const registry = `registry.fly.io/${appName}`;
    const reference = image.slice(registry.length);
    if (
      !image.startsWith(registry) ||
      !/^(:deployment-[a-z0-9]+|@sha256:[a-f0-9]{64})$/i.test(reference)
    ) {
      return yield* Effect.die(new Error(
        `FLY_STAGING_IMAGE must be a deployment tag or SHA-256 digest from ${registry}.`,
      ));
    }

    const app = yield* Fly.App('App', { name: appName });
    yield* Fly.IpAssignment('PublicIPv4', { app, type: 'shared_v4' });

    const game = yield* Fly.Machine('Game', {
      app,
      region: 'lhr',
      count: 1,
      image,
      guest: { cpuKind: 'shared', cpus: 1, memoryMb: 256 },
      deploy: { strategy: 'rolling' },
      shutdown: { signal: 'SIGTERM', timeout: '10 seconds' },
      env: { HOST: '0.0.0.0', PORT: String(port), DATABASE_PATH: '/data/game.db' },
      mounts: [{ name: 'data', path: '/data', sizeGb: 1 }],
      services: [{
        protocol: 'tcp',
        internalPort: port,
        autostart: true,
        autostop: 'stop',
        minMachinesRunning: 0,
        ports: [
          { port: 80, handlers: ['http'], forceHttps: true },
          { port: 443, handlers: ['tls', 'http'] },
        ],
        checks: [{
          type: 'http',
          method: 'GET',
          path: '/healthz',
          gracePeriod: '5s',
          interval: '10s',
          timeout: '2s',
        }],
      }],
    });

    return {
      url: app.url,
      machineId: game.machineId,
      volumeId: game.mounts.pipe(Output.map((mounts) => mounts[0]?.volumeId)),
    };
  }),
);
