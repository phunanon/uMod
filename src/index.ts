import * as dotenv from 'dotenv';
import { client, log } from './infrastructure';
import * as Features from './features';
import { Feature } from './features';
dotenv.config();

console.log('Loading...');

const features = [
  Features.WhitelistChannel,
  Features.KickInviteSpam,
  Features.Ping,
  Features.PermaRole,
  Features.MirrorGuild,
  Features.Leaderboard,
  Features.StickyMessage,
];

client.once('ready', async () => {
  client
    .on('guildMemberUpdate', dispatchEvent('HandleMemberUpdate'))
    .on('guildMemberAdd', dispatchEvent('HandleMemberAdd'))
    .on('messageCreate', dispatchEvent('HandleMessageCreate'))
    .on('interactionCreate', dispatchEvent('HandleInteractionCreate'));

  setTimeout(async () => {
    if (!client.application) return;
    for (const feature of features) {
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
    for (const feature of features) {
      const featureFn = feature[fn];
      if (!featureFn) continue;
      await failable(featureFn)(...args);
    }
  };
}
