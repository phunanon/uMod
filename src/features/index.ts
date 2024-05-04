import {
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
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

export type Feature = {
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
    where: { snowflake: BigInt(snowflake) },
  });
  return record !== null;
};

export const ModeratorOnly = async (
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
