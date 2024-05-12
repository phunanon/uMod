import * as dotenv from 'dotenv';
import { client, log, prisma } from './infrastructure';
import { Feature, features } from './features';
import {
  AuditLogEvent,
  ChannelType,
  Guild,
  GuildAuditLogsEntry,
  Interaction,
  InteractionType,
  Message,
  PartialMessage,
  User,
} from 'discord.js';
dotenv.config();

console.log('Loading...');

client.once('ready', async () => {
  client
    .on('guildMemberUpdate', handleEvent('HandleMemberUpdate'))
    .on('guildMemberAdd', handleEvent('HandleMemberAdd'))
    .on('guildMemberRemove', handleEvent('HandleMemberRemove'))
    .on('messageCreate', handleMessage)
    .on('messageUpdate', handleMessage)
    .on('interactionCreate', handleInteraction)
    .on('guildAuditLogEntryCreate', handleAudit);

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

const handleEvent =
  <T extends 'HandleMemberUpdate' | 'HandleMemberAdd' | 'HandleMemberRemove'>(
    fn: T,
  ) =>
  async (...args: Parameters<NonNullable<Feature[T]>>): Promise<void> => {
    for (const feature of Object.values(features)) {
      const featureFn = feature[fn];
      if (!featureFn) continue;
      await failable(featureFn)(...args);
    }
  };

const handleInteraction = failable(_handleInteraction);
async function _handleInteraction(interaction: Interaction): Promise<void> {
  if (
    interaction.channel?.type !== ChannelType.GuildText ||
    interaction.type !== InteractionType.ApplicationCommand ||
    !interaction.isChatInputCommand() ||
    !interaction.guild ||
    !interaction.member ||
    !client.user
  ) {
    if (interaction.isRepliable()) {
      await interaction.reply('Unavailable here or at this time.');
    }
    return;
  }

  const { channel, guild, member } = interaction;
  const guildSf = BigInt(interaction.guild.id);
  const channelSf = BigInt(interaction.channel.id);
  const userSf = BigInt(member.user.id);

  const feature = (() => {
    for (const feature of Object.values(features)) {
      const info = feature.Interaction;
      if (info?.commandName !== interaction.commandName) continue;
      return info;
    }
  })();

  if (!feature) {
    await interaction.reply({ content: 'Command not found.', ephemeral: true });
    return;
  }

  if (feature.moderatorOnly) {
    const id = member.user.id;
    const me = await guild.members.fetch(client.user.id);
    const them = await guild.members.fetch(id);
    const notMod = them.roles.highest.position < me.roles.highest.position;
    if (notMod) {
      await interaction.reply('You must be a moderator to use this command!');
      return;
    }
  }

  const context = { interaction, guildSf, userSf, channelSf, channel };
  await feature.handler(context);
}

export const IsChannelWhitelisted = async (snowflake: string) => {
  const record = await prisma.channelWhitelist.findFirst({
    where: { sf: BigInt(snowflake) },
  });
  return record !== null;
};

const handleMessage = failable(_handleMessage);
async function _handleMessage(
  oldMessage: Message | PartialMessage,
  newMessage?: Message | PartialMessage,
): Promise<void> {
  const maybePartial = newMessage ?? oldMessage;
  const message = maybePartial.partial
    ? await maybePartial.fetch()
    : maybePartial;
  if (message.channel.type !== ChannelType.GuildText) return;
  if (message.author?.bot !== false) return;
  if (await IsChannelWhitelisted(message.channel.id)) return;
  if (!message.guildId) return;
  const guildSf = BigInt(message.guildId);
  const channelSf = BigInt(message.channel.id);
  const userSf = BigInt(message.author.id);
  const { channel } = message;
  const isEdit = !!newMessage;
  const context = { message, guildSf, channelSf, userSf, channel, isEdit };

  for (const [name, feature] of Object.entries(features)) {
    const { HandleMessage } = feature;
    try {
      const signal = await HandleMessage?.(context);
      if (signal === 'stop') break;
    } catch (error) {
      console.error(name, error);
    }
  }
}

async function handleAudit(log: GuildAuditLogsEntry, guild: Guild) {
  const entry = (() => {
    if (log.action === AuditLogEvent.MemberBanAdd)
      return {
        kind: 'ban',
        target: log.target as User,
        executor: log.executor as User,
        reason: log.reason ?? 'No reason provided',
      } as const;
    if (log.action === AuditLogEvent.MemberBanRemove)
      return {
        kind: 'unban',
        target: log.target as User,
        executor: log.executor as User,
        reason: log.reason ?? 'No reason provided',
      } as const;
    if (log.action === AuditLogEvent.MemberKick)
      return {
        kind: 'kick',
        target: log.target as User,
        executor: log.executor as User,
        reason: log.reason ?? 'No reason provided',
      } as const;
    if (log.action === AuditLogEvent.MemberUpdate) {
      if (log.action === 24) {
        return {
          kind: 'timeout',
          target: log.target as User,
          executor: log.executor as User,
          reason: log.reason ?? 'No reason provided',
        } as const;
      }
    }
  })();

  if (!entry) return;

  for (const [name, feature] of Object.entries(features)) {
    const { HandleAuditLog } = feature;
    try {
      await HandleAuditLog?.(entry, guild);
    } catch (error) {
      console.error(name, error);
    }
  }
}
