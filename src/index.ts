import * as dotenv from 'dotenv';
import { client, log } from './infrastructure';
import { Feature, features } from './features';
dotenv.config();

console.log('Loading...');

client.once('ready', async () => {
  client
    .on('guildMemberUpdate', dispatchEvent('HandleMemberUpdate'))
    .on('guildMemberAdd', dispatchEvent('HandleMemberAdd'))
    .on('guildMemberRemove', dispatchEvent('HandleMemberRemove'))
    .on('messageCreate', dispatchEvent('HandleMessageCreate'))
    .on('messageUpdate', dispatchEvent('HandleMessageUpdate'))
    .on('interactionCreate', dispatchEvent('HandleInteractionCreate'));

  const inits = Object.entries(features).flatMap(([name, feature]) =>
    feature.Init ? [[name, feature.Init] as const] : [],
  );

  const initTimer = setInterval(async () => {
    if (!client.application) return;
    const feature = inits.shift();
    if (!feature) {
      clearInterval(initTimer);
      log('Features initialised.');
      return;
    }
    const [name, init] = feature;
    process.stdout.write(`${name}... `);
    await init(client.application.commands);
  }, 1000);

  log('Ready.');
});

(async () => {
  await client.login(process.env.DISCORD_TOKEN);
})();

function failable<T extends (...args: any[]) => Promise<void>>(fn: T) {
  return async (...args: Parameters<T>): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      console.error(error);
    }
  };
}

const dispatchEvent =
  <T extends keyof Feature>(fn: T) =>
  async (...args: Parameters<NonNullable<Feature[T]>>): Promise<void> => {
    for (const feature of Object.values(features)) {
      const featureFn = feature[fn];
      if (!featureFn) continue;
      await failable(featureFn)(...args);
    }
  };
