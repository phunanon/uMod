import * as dotenv from 'dotenv';
import { client, isGoodChannel, log, prisma } from './infrastructure';
import { Feature, features, SubCommands } from './features';
import {
  ApplicationCommandOptionType,
  AuditLogEvent,
  Guild,
  GuildAuditLogsEntry,
  GuildMember,
  Interaction,
  Message,
  PartialMessage,
  User,
} from 'discord.js';
import { REST, Routes } from 'discord.js';
import { assert } from 'console';
dotenv.config();
const { DISCORD_TOKEN } = process.env;
assert(DISCORD_TOKEN, 'DISCORD_TOKEN must be set in .env');

console.log('Loading...');

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

  const rest = new REST().setToken(DISCORD_TOKEN!);
  await rest
    .put(Routes.applicationCommands(client.user!.id), { body: [] })
    .then(() => console.log('Successfully deleted all application commands.'))
    .catch(console.error);

  const inits = Object.entries(features).flatMap(([name, feature]) =>
    feature.Init || feature.ModCommands
      ? [[name, feature.Init, feature.ModCommands ?? []] as const]
      : [],
  );

  const modCommands: SubCommands = [];
  const createModCommands = async () => {
    if (modCommands.length) {
      console.log('\ncreating /mod');
      await client.application?.commands.create({
        name: 'mod',
        description: 'Moderation commands',
        options: modCommands.map(c => ({
          ...c,
          type: ApplicationCommandOptionType.Subcommand,
        })),
      });
      console.log('/mod created');
    }
  };
  const initTimer = setInterval(async () => {
    if (!client.application) return;
    const feature = inits.shift();
    if (!feature) {
      clearInterval(initTimer);
      setTimeout(createModCommands, 1000);
      log('Features initialised.');
      return;
    }
    const [name, Init, ModCommands] = feature;
    process.stdout.write(`${name}... `);
    await Init?.(client.application.commands);
    modCommands.push(
      ...(Array.isArray(ModCommands) ? ModCommands : await ModCommands()),
    );
  }, 1000);

  log('Ready.');
});

(async () => {
  await client.login(DISCORD_TOKEN);
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
    'options' in interaction && 'getSubcommand' in interaction.options
      ? interaction.options.getSubcommand()
      : 'commandName' in interaction
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

  const details = await FetchDetails(guild, member, userSf);
  if (feature.moderatorOnly && !details.isMod) {
    const { noMods } = details;
    const content = noMods
      ? `No moderators have been set up yet! Contact <@${guild.ownerId}> to use \`/guild-mods\` to assign moderators.`
      : 'You must be a moderator to use this command!';
    await interaction.reply({ content, allowedMentions: { parse: [] } });
    return;
  }

  const context = {
    ...{ guildSf, userSf, channelSf },
    ...{ guild, channel, member },
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
    if (!client.user) return;

    const { guild, channel, member } = message;
    const guildSf = BigInt(message.guildId);
    const userSf = BigInt(message.author.id);
    const isBot = message.author.bot;
    const isEdit = kind === 'update';
    const isDelete = kind === 'delete';
    const details = await FetchDetails(guild, member, userSf);

    const context = {
      ...{ guild, channel, message },
      ...{ guildSf, channelSf, userSf },
      ...{ isEdit, isDelete },
      ...details,
    };

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
        const signal =
          isBot && 'HandleBotMessage' in feature
            ? await feature.HandleBotMessage?.(context)
            : member && !isBot && (await handler?.({ ...context, member }));
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

const FetchDetails = async (
  guild: Guild,
  member: GuildMember | null,
  userSf: bigint,
) => {
  const isOwner = BigInt(guild.ownerId) === userSf;
  const modRoles = await prisma.guildMods.findMany({
    where: { guildSf: BigInt(guild.id) },
  });
  const hasModRole =
    member && modRoles.some(role => member.roles.cache.has(`${role.roleSf}`));
  const isMod = (isOwner || hasModRole) ?? false;
  const unmoddable =
    (isMod ||
      (guild.members.me &&
        member &&
        member.roles.highest.position >=
          guild.members.me.roles.highest.position)) ??
    false;
  return { isMod, unmoddable, isOwner, noMods: !modRoles.length };
};
