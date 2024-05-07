import * as dotenv from 'dotenv';
import { client, log } from './infrastructure';
import { Feature, features } from './features';
dotenv.config();

console.log('Loading...');

client.once('ready', async () => {
  client
    .on('guildMemberUpdate', dispatchEvent('HandleMemberUpdate'))
    .on('guildMemberAdd', dispatchEvent('HandleMemberAdd'))
    .on('messageCreate', dispatchEvent('HandleMessageCreate'))
    .on('interactionCreate', dispatchEvent('HandleInteractionCreate'));

  setTimeout(async () => {
    if (!client.application) return;
    for (const [name, feature] of Object.entries(features)) {
      process.stdout.write(`${name}... `);
      await feature.Init?.(client.application.commands);
    }
    log('Features initialised.');
  });

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

function dispatchEvent<T extends keyof Feature>(fn: T) {
  return async (
    ...args: Parameters<NonNullable<Feature[T]>>
  ): Promise<void> => {
    for (const feature of Object.values(features)) {
      const featureFn = feature[fn];
      if (!featureFn) continue;
      await failable(featureFn)(...args);
    }
  };
}
