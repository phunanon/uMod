import {
  ApplicationCommandManager,
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  InteractionType,
  Message,
  MessageContextMenuCommandInteraction,
  PartialGuildMember,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { client, prisma } from '../infrastructure';

export { PermaRole } from './PermaRole';
export { KickInviteSpam } from './KickInviteSpam';
export { Ping } from './Ping';
export { WhitelistChannel } from './WhitelistChannel';
export { MirrorGuild } from './MirrorGuild';
export { Leaderboard } from './Leaderboard';
export { StickyMessage } from './StickyMessage';

export type Feature = {
  /** Call is guaranteed but not necessarily prior to other handlers. */
  Init?: (commands: ApplicationCommandManager) => Promise<void>;
  HandleMemberUpdate?: (
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ) => Promise<void>;
  HandleMemberAdd?: (member: GuildMember) => Promise<void>;
  HandleMessageCreate?: (message: Message) => Promise<void>;
  HandleInteractionCreate?: (interaction: Interaction) => Promise<void>;
};

export const IsChannelWhitelisted = async (snowflake: string) => {
  const record = await prisma.channelWhitelist.findFirst({
    where: { sf: BigInt(snowflake) },
  });
  return record !== null;
};

const ModeratorOnly = async (
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
) => {
  const guild = interaction.guild;
  const id = interaction.member?.user.id;
  if (!client.user || !guild || !id) return false;
  const me = await guild.members.fetch(client.user.id);
  const them = await guild.members.fetch(id);
  const notMod = them.roles.highest.position < me.roles.highest.position;
  if (notMod) {
    await interaction.reply('You must be a moderator to use this command!');
  }
  return notMod;
};

export const InteractionGuard = async (
  chatInteraction: Interaction,
  commandName: string,
  moderatorOnly: boolean,
) => {
  if (chatInteraction.channel?.type !== ChannelType.GuildText) return;
  if (chatInteraction.type !== InteractionType.ApplicationCommand) return;
  if (chatInteraction.commandName !== commandName) return;
  if (moderatorOnly && (await ModeratorOnly(chatInteraction))) return;
  const guildId = chatInteraction.guildId;
  if (!guildId) return;
  return {
    guildSf: BigInt(guildId),
    channelSf: BigInt(chatInteraction.channelId),
    channel: chatInteraction.channel,
    chatInteraction,
  };
};
