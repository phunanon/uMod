import * as dotenv from 'dotenv';
import { client, log, prisma } from './infrastructure';
import { Feature, features } from './features';
import {
  AuditLogEvent,
  ChannelType,
  ClientUser,
  Guild,
  GuildAuditLogsEntry,
  Interaction,
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
    .on('messageCreate', handleMessage('create'))
    .on('messageUpdate', handleMessage('update'))
    .on('messageDelete', handleMessage('delete'))
    .on('interactionCreate', handleInteraction)
    .on('guildAuditLogEntryCreate', handleAudit)
    .on('channelDelete', handleEvent('HandleChannelDelete'));

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
  <
    T extends
      | 'HandleMemberUpdate'
      | 'HandleMemberAdd'
      | 'HandleMemberRemove'
      | 'HandleChannelDelete',
  >(
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
    (!interaction.isChatInputCommand() && !interaction.isButton()) ||
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
  const name =
    'commandName' in interaction
      ? interaction.commandName
      : interaction.customId;

  const feature = (() => {
    for (const feature of Object.values(features)) {
      const info = feature.Interaction;
      if (!info) continue;
      if (
        info.name === name ||
        (info.name.endsWith('*') && name.startsWith(info.name.slice(0, -1)))
      )
        return info;
    }
  })();

  if (!feature) {
    await interaction.reply({ content: 'Command not found.', ephemeral: true });
    return;
  }

  if (feature.moderatorOnly) {
    const notMod = !(await CheckIfMod(client.user, guild, userSf));
    if (notMod) {
      await interaction.reply('You must be a moderator to use this command!');
      return;
    }
  }

  const context = { guildSf, userSf, channelSf, channel, guild };
  if (interaction.isChatInputCommand()) {
    if ('command' in feature) {
      await feature.command({ ...context, interaction });
    } else console.warn(feature.name, 'has not implemented', name);
  } else {
    if ('button' in feature) {
      await feature.button({ ...context, interaction });
    } else console.warn(feature.name, 'has not implemented', name);
  }
}

export const IsChannelUnmoderated = async (channelSf: bigint) => {
  const record = await prisma.channelFlags.findFirst({
    where: { channelSf },
  });
  return record?.unmoderated === true;
};

function handleMessage(kind: 'create' | 'update' | 'delete') {
  async function handle(
    oldMessage: Message | PartialMessage,
    newMessage?: Message | PartialMessage,
  ): Promise<void> {
    const maybePartial = newMessage ?? oldMessage;
    const message = maybePartial.partial
      ? await maybePartial.fetch()
      : maybePartial;
    if (message.channel.type !== ChannelType.GuildText) return;
    if (message.author?.bot !== false) return;
    const channelSf = BigInt(message.channel.id);
    if (await IsChannelUnmoderated(channelSf)) return;
    if (!message.guildId || !message.guild) return;
    if (!client.user) return;
    const { guild, channel } = message;
    const guildSf = BigInt(message.guildId);
    const userSf = BigInt(message.author.id);
    const isEdit = kind === 'update';
    const isDelete = kind === 'delete';
    const isMod = await CheckIfMod(client.user, guild, userSf);
    const context = {
      ...{ guild, channel, message },
      ...{ guildSf, channelSf, userSf },
      ...{ isEdit, isDelete, isMod },
    };

    for (const [name, feature] of Object.entries(features)) {
      const handler = (() => {
        if (isEdit && 'HandleMessageUpdate' in feature)
          return feature.HandleMessageUpdate;
        if (isDelete && 'HandleMessageDelete' in feature)
          return feature.HandleMessageDelete;
        if ('HandleMessage' in feature) return feature.HandleMessage;
      })();
      try {
        const signal = await handler?.(context);
        if (signal === 'stop') break;
      } catch (error) {
        console.error(name, error);
      }
    }
  }
  return failable(handle);
}

async function handleAudit(log: GuildAuditLogsEntry, guild: Guild) {
  const entry = (() => {
    const target = log.target as User | null;
    const executor = log.executor;
    const reason = log.reason ?? 'No reason provided';
    if (log.action === AuditLogEvent.MemberBanAdd)
      return { kind: 'ban', target, executor, reason } as const;
    if (log.action === AuditLogEvent.MemberBanRemove)
      return { kind: 'unban', target, executor, reason } as const;
    if (log.action === AuditLogEvent.MemberKick)
      return { kind: 'kick', target, executor, reason } as const;
    if (log.action === AuditLogEvent.MemberUpdate) {
      const timeout = log.changes.find(
        change => change.key === 'communication_disabled_until',
      );
      if (timeout) {
        const durationMs =
          new Date(`${timeout.new}`).getTime() - new Date().getTime();
        const durationMin = Math.ceil(durationMs / 60_000);
        const r = `${durationMin}m: ${reason}`;
        return { kind: 'timeout', target, executor, reason: r } as const;
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

export const CheckIfMod = async (
  user: ClientUser,
  guild: Guild,
  userSf: bigint,
) => {
  const them = await guild.members.fetch(`${userSf}`);
  const me = await guild.members.fetch(user.id);
  return them.roles.highest.position >= me.roles.highest.position;
};
