import { ChannelType, InteractionType, Message } from 'discord.js';
import { Feature, IsChannelWhitelisted } from '.';
import { prisma } from '../infrastructure';

export const Leaderboard: Feature = {
  async HandleInteractionCreate(interaction) {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    if (interaction.commandName !== 'leaderboard') return;
    const guildId = interaction.guildId;
    if (!guildId) return;
    const { id, tag } = interaction.user;
    const member = await getMember(tag, id, guildId);

    const top10 = await prisma.member.findMany({
      select: { id: true, tag: true, numMessages: true },
      orderBy: { numMessages: 'desc' },
      take: 10,
    });

    const boldIfUser = ({ index, tag }: { index: number; tag: string }) => {
      const i = (index + 1).toString().padStart(2, ' ');
      return `\`${i}\` ` + (tag === member.tag ? `**${tag}**` : tag);
    };

    const leaderboard = top10.map((row, index) => {
      const tag = boldIfUser({ index, ...row });
      return `${tag}: ${row.numMessages} messages`;
    });

    if (!top10.some(({ id }) => id === member.id)) {
      const userRank = await prisma.member.count({
        where: { numMessages: { gt: member.numMessages } },
      });
      const index = userRank + 1;
      const tag = boldIfUser({ index, ...member });
      const stat = `${tag}: ${member.numMessages} messages`;
      leaderboard.push('...', stat);
    }

    await interaction.reply('.\n' + leaderboard.join('\n'));
  },
  async HandleMessageCreate(message: Message) {
    if (await IsChannelWhitelisted(message.channel.id)) return;
    const guildId = message.guild?.id;
    if (!guildId) return;
    const { id, tag } = message.author;
    const member = await getMember(tag, id, guildId);

    await prisma.member.update({
      where: { id: member.id },
      data: { numMessages: { increment: 1 } },
    });
  },
};

async function getMember(tag: string, userId: string, guildId: string) {
  const snowflake = BigInt(userId);
  const guildSnowflake = BigInt(guildId);
  const snowflake_guildSnowflake = { snowflake, guildSnowflake };
  const data = { tag, snowflake, guildSnowflake };

  const member =
    (await prisma.member.findUnique({ where: { snowflake_guildSnowflake } })) ??
    (await prisma.member.create({ data }));
  return member;
}
