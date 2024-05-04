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

    //Fetch both the top ten and the user's rank
    const result: { tag: string; rank: bigint; numMessages: number }[] =
      await prisma.$queryRaw`
      WITH ranked AS (
        SELECT id, tag, numMessages, ROW_NUMBER() OVER (ORDER BY numMessages DESC) as rank
        FROM "Member"
        WHERE "guildSnowflake" = ${BigInt(guildId)}
      )
      SELECT tag, rank, numMessages
      FROM ranked
      WHERE id = ${member.id}
      UNION ALL
      SELECT tag, rank, numMessages
      FROM ranked
      WHERE rank <= 10
      ORDER BY rank`;

    const userRankAt = result.findIndex(row => row.tag === member.tag);
    const userRank = result[userRankAt]?.rank ?? 0n;
    result.splice(userRankAt, 1);

    const boldIfUser = ({ tag }: { tag: string }) =>
      tag === member.tag ? `**${tag}**` : tag;

    const leaderboard = result.map(row => {
      const tag = boldIfUser(row);
      return `${row.rank}. ${tag}: ${row.numMessages} messages`;
    });

    if (userRank > 10n) {
      const tag = boldIfUser(member);
      const stat = `${userRank}. ${tag}: ${member.numMessages} messages`;
      leaderboard.push(stat);
    }

    await interaction.reply(leaderboard.join('\n'));
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
