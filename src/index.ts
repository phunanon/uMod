import * as dotenv from 'dotenv';
import { client, isGoodChannel, log, prisma } from './infrastructure';
import { Feature, features } from './features';
import { GuildAuditLogsEntry, GuildMember } from 'discord.js';
import { ActivityType, AuditLogEvent, Guild } from 'discord.js';
import { Interaction, Message, PartialMessage, User } from 'discord.js';
import { assert } from 'console';
dotenv.config();
const { DISCORD_TOKEN } = process.env;
assert(DISCORD_TOKEN, 'DISCORD_TOKEN must be set in .env');

console.log('Loading...');

const stats: { messages: Date[] } = { messages: [] };
const pushStat = (name: keyof typeof stats) => {
  stats[name].push(new Date());
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (stats[name][0] && stats[name][0] < anHourAgo) stats[name].shift();
};

client.once('ready', async () => {
  for (const [_, guild] of client.guilds.cache) {
    //(await guild.members.fetchMe()).setNickname('µM');
    console.log(`${guild.id} ${guild.name}`);
  }

  client
    .on('guildMemberUpdate', handleEvent('HandleMemberUpdate'))
    .on('guildMemberAdd', handleEvent('HandleMemberAdd'))
    .on('guildMemberRemove', handleEvent('HandleMemberRemove'))
    .on('voiceStateUpdate', handleEvent('HandleVoiceStateUpdate'))
    .on('typingStart', handleEvent('HandleTypingStart'))
    .on('messageReactionAdd', handleEvent('HandleReactionAdd'))
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

function SetStatActivity(stat: number) {
  const totalMembers = client.guilds.cache.reduce(
    (acc, guild) => acc + guild.memberCount,
    0,
  );
  const statList = [
    ...Object.entries(stats).map(
      ([k, v]) => `Read ${v.length.toLocaleString()} ${k}/hour`,
    ),
    `I'm in ${client.guilds.cache.size} servers`,
    `Moderating ${totalMembers.toLocaleString()} members`,
  ];
  client.user?.setActivity({
    name: statList[stat]!,
    type: ActivityType.Custom,
  });
  setTimeout(
    () => SetStatActivity(++stat >= statList.length ? 0 : stat),
    60_000,
  );
}

(async () => {
  await client.login(DISCORD_TOKEN);
  setTimeout(() => SetStatActivity(0), 60_000);
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
      | 'HandleChannelDelete'
      | 'HandleVoiceStateUpdate'
      | 'HandleTypingStart'
      | 'HandleReactionAdd',
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
  const { channel, guild, member } = interaction;
  if (
    !isGoodChannel(channel) ||
    (!interaction.isChatInputCommand() &&
      !interaction.isButton() &&
      !interaction.isModalSubmit() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isMessageContextMenuCommand()) ||
    !guild ||
    !member ||
    !('_roles' in member) ||
    !client.user
  ) {
    if (interaction.isRepliable()) {
      await interaction.reply('Unavailable here or at this time.');
    }
    return;
  }

  const guildSf = BigInt(guild.id);
  const channelSf = BigInt(channel.id);
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

  const details = await FetchUserDetails(guild, member, userSf);
  const anyOfPermission =
    typeof feature.needPermit === 'string'
      ? [feature.needPermit]
      : Array.isArray(feature.needPermit)
      ? feature.needPermit
      : [feature.name];
  if (
    feature.needPermit &&
    !details.isOwner &&
    !details.permissions.includes('all') &&
    !details.permissions.some(p => anyOfPermission.includes(p))
  ) {
    const permissions = anyOfPermission.map(p => `\`${p}\``).join(', ');
    const either = anyOfPermission.length ? 'either ' : '';
    const { noPermissions } = details;
    const content = noPermissions
      ? `No permissions have been set up yet! Contact <@${guild.ownerId}> to use \`/guild-permit\` to assign permissions.`
      : `You must have the correct permissions to use this command (${either}${permissions}).`;
    await interaction.reply({ content, allowedMentions: { parse: [] } });
    return;
  }

  const channelFlags = await FetchChannelFlags(channelSf);

  const context = {
    ...{ guildSf, userSf, channelSf },
    ...{ guild, channel, channelFlags, member },
    ...details,
  };
  if (interaction.isChatInputCommand()) {
    if ('command' in feature) {
      await feature.command({ ...context, interaction });
    } else console.warn(feature.name, 'has not implemented', name);
  } else if (interaction.isButton()) {
    if ('button' in feature) {
      await feature.button({ ...context, interaction });
    } else console.warn(feature.name, 'has not implemented', name);
  } else if (interaction.isModalSubmit()) {
    if ('modalSubmit' in feature) {
      await feature.modalSubmit({ ...context, interaction });
    } else console.warn(feature.name, 'has not implemented', name);
  } else if (interaction.isStringSelectMenu()) {
    if ('stringSelect' in feature) {
      await feature.stringSelect({ ...context, interaction });
    } else console.warn(feature.name, 'has not implemented', name);
  } else if (interaction.isMessageContextMenuCommand()) {
    if ('contextMenu' in feature) {
      await feature.contextMenu({ ...context, interaction });
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
    if (!client.user) return;
    const maybePartial = newMessage ?? oldMessage;
    const message = await (async () => {
      try {
        return maybePartial.partial ? await maybePartial.fetch() : maybePartial;
      } catch (e) {}
    })();
    if (!message) return;
    if (!isGoodChannel(message.channel)) return;
    const channelSf = BigInt(message.channel.id);
    if (await IsChannelUnmoderated(channelSf)) return;
    if (!message.guildId || !message.guild) return;

    const { guild, channel, member } = message;
    const guildSf = BigInt(message.guildId);
    const userSf = BigInt(message.author.id);
    const isBot = message.author.bot;
    const isEdit = kind === 'update';
    const isDelete = kind === 'delete';
    const details = await FetchUserDetails(guild, member, userSf);
    const channelFlags = await FetchChannelFlags(channelSf);

    const context = {
      ...{ guild, channel, channelFlags, message },
      ...{ guildSf, channelSf, userSf },
      ...{ isEdit, isDelete },
      ...details,
    };

    if (!isBot) pushStat('messages');

    for (const [name, feature] of Object.entries(features)) {
      const handler = (() => {
        if (isEdit && 'HandleMessageUpdate' in feature)
          return feature.HandleMessageUpdate;
        if (isDelete && 'HandleMessageDelete' in feature)
          return feature.HandleMessageDelete;
        if (kind === 'create' && 'HandleMessageCreate' in feature)
          return feature.HandleMessageCreate;
        if ('HandleMessage' in feature) return feature.HandleMessage;
      })();
      try {
        const signal = await (async () => {
          if (isBot && 'HandleBotMessageCreate' in feature) {
            if (isEdit || isDelete) return;
            return feature.HandleBotMessageCreate?.(context);
          }
          if (!isBot && member) await handler?.({ ...context, member });
        })();
        if (signal === 'stop') break;
      } catch (error) {
        console.error(name, error);
      }
    }
  }
  return failable(handle);
}

async function FetchChannelFlags(channelSf: bigint) {
  return (
    (await prisma.channelFlags.findUnique({ where: { channelSf } })) ??
    (await prisma.channelFlags.create({ data: { channelSf } }))
  );
}

async function handleAudit(log: GuildAuditLogsEntry, guild: Guild) {
  const entry = (() => {
    const target = log.target as User | null;
    const executor = log.executor;
    const entry = { target, executor };
    const reason = log.reason ?? 'No reason provided';
    if (log.action === AuditLogEvent.MemberBanAdd)
      return { kind: 'ban', ...entry, reason } as const;
    if (log.action === AuditLogEvent.MemberBanRemove)
      return { kind: 'unban', ...entry, reason } as const;
    if (log.action === AuditLogEvent.MemberKick)
      return { kind: 'kick', ...entry, reason } as const;
    if (log.action === AuditLogEvent.MemberUpdate) {
      const timeout = log.changes.find(
        change => change.key === 'communication_disabled_until',
      );
      if (!timeout) return;
      if (!timeout.new)
        return { kind: 'untimeout', ...entry, reason: undefined } as const;
      const durationMs =
        new Date(`${timeout.new}`).getTime() - new Date().getTime();
      const durationMin = Math.ceil(durationMs / 60_000);
      const r = `${durationMin}m: ${reason}`;
      return { kind: 'timeout', target, executor, reason: r } as const;
    }
  })();

  if (!entry) return;
  const { reason } = entry;
  if (reason?.includes('Pinging protected')) return;
  if (reason?.includes('Warning for ') && reason?.includes('Spam')) return;

  for (const [name, feature] of Object.entries(features)) {
    const { HandleAuditLog } = feature;
    try {
      await HandleAuditLog?.(entry, guild);
    } catch (error) {
      console.error(name, error);
    }
  }
}

const FetchUserDetails = async (
  guild: Guild,
  member: GuildMember | null,
  userSf: bigint,
) => {
  const isOwner = BigInt(guild.ownerId) === userSf;
  const guildPermissions = await prisma.guildPermission.findMany({
    where: { guildSf: BigInt(guild.id) },
  });
  const permissions = member
    ? guildPermissions
        .filter(p => member.roles.cache.has(`${p.roleSf}`))
        .map(p => p.permission)
    : [];
  const itsMe = member && userSf === BigInt(client.user?.id ?? 0);
  const unmoddable =
    (itsMe ||
      (guild.members.me &&
        member &&
        member.roles.highest.position >=
          guild.members.me.roles.highest.position)) ??
    false;
  return {
    permissions,
    unmoddable,
    isOwner,
    noPermissions: !guildPermissions.length,
  };
};
