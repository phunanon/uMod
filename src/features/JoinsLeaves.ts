import { GuildMember, PartialGuildMember } from 'discord.js';
import { Feature, InteractionGuard } from '.';
import { prisma } from '../infrastructure';

export const JoinsLeaves: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'log-joins-leaves',
      description: 'Log to this channel when members join or leave the server.',
    });
  },
  async HandleMemberAdd(member) {
    const channel = await GetChannel(member);
    await channel?.send(`:inbox_tray: <@${member.id}> joined.`);
  },
  async HandleMemberRemove(member) {
    const channel = await GetChannel(member);
    const { id, tag } = member.user;
    await channel?.send(`:outbox_tray: <@${id}> (${tag}) left.`);
  },
  async HandleInteractionCreate(interaction) {
    const { chatInteraction, channelSf, guildSf } =
      (await InteractionGuard(interaction, 'log-joins-leaves', true)) ?? {};
    if (!chatInteraction || !channelSf || !guildSf) return;

    await chatInteraction.deferReply();

    const existing = await prisma.joinsLeaves.findFirst({ where: { guildSf } });

    if (existing) {
      await prisma.joinsLeaves.delete({ where: { id: existing.id } });
      await chatInteraction.editReply('Joins and leaves logging disabled.');
      return;
    }

    await prisma.joinsLeaves.create({ data: { guildSf, channelSf } });

    await chatInteraction.editReply('Joins and leaves logging enabled.');
  },
};

const GetChannel = async (member: GuildMember | PartialGuildMember) => {
  const where = { guildSf: BigInt(member.guild.id) };
  const config = await prisma.joinsLeaves.findFirst({ where });
  if (!config) return;

  const channel = await member.guild.channels.fetch(`${config.channelSf}`);
  return channel?.isTextBased() ? channel : undefined;
};
