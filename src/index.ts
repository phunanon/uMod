import * as dotenv from 'dotenv';
import { client, log } from './infrastructure';
import * as Features from './features';
import { Feature } from './features';
import { ApplicationCommandOptionType } from 'discord.js';
dotenv.config();

console.log('Loading...');

const features = [
  Features.WhitelistChannel,
  Features.KickInviteSpam,
  Features.Ping,
  Features.PermaRole,
  Features.MirrorGuild,
  Features.Leaderboard,
];

client.once('ready', async () => {
  client
    .on('guildMemberUpdate', dispatchEvent('HandleMemberUpdate'))
    .on('guildMemberAdd', dispatchEvent('HandleMemberAdd'))
    .on('messageCreate', dispatchEvent('HandleMessageCreate'))
    .on('interactionCreate', dispatchEvent('HandleInteractionCreate'));

  setTimeout(async () => {
    if (!client.application) return;
    const { commands } = client.application;

    await commands.create({ name: 'ping', description: 'Replies with pong!' });
    await commands.create({
      name: 'whitelist-channel',
      description: 'Disable moderation for a channel.',
      options: [
        {
          name: 'channel',
          description: 'The channel to whitelist.',
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
      ],
    });
    await commands.create({
      name: 'mirror-guild',
      description: 'Mirror messages from entire guild into a channel.',
      options: [
        {
          name: 'channel',
          description: 'The channel to mirror to.',
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
      ],
    });
    await commands.create({
      name: 'leaderboard',
      description: 'Show the leaderboard.',
    });
    log('Commands registered.');
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
