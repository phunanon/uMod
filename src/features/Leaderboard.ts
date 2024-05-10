import { Feature } from '.';
import { prisma } from '../infrastructure';

export const Leaderboard: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'leaderboard',
      description: 'Show the server leaderboard.',
    });
  },
  Interaction: {
    commandName: 'leaderboard',
    moderatorOnly: false,
    async handler({ interaction, guildSf }) {
      await interaction.deferReply();

      const { id, tag } = interaction.user;
      const member = await getMember(tag, id, guildSf);

      const top10 = await prisma.member.findMany({
        where: { guildSf },
        select: { id: true, tag: true, numMessages: true },
        orderBy: { numMessages: 'desc' },
        take: 10,
      });

      const boldIfUser = ({ index, tag }: { index: number; tag: string }) => {
        const i = (index + 1).toString().padStart(2, ' ');
        return '`' + i + ' ' + (tag === member.tag ? `${tag}` : tag) + '`';
      };

      const leaderboard = top10.map((row, index) => {
        const tag = boldIfUser({ index, ...row });
        return `${tag} ${row.numMessages} messages`;
      });

      if (!top10.some(({ id }) => id === member.id)) {
        const userRank = await prisma.member.count({
          where: { numMessages: { gt: member.numMessages } },
        });
        const index = userRank + 1;
        const tag = boldIfUser({ index, ...member });
        const stat = `${tag} ${member.numMessages} messages`;
        leaderboard.push('...', stat);
      }

      await interaction.editReply('.\n' + leaderboard.join('\n'));
    },
  },
  async HandleMessage({ message, guildSf }) {
    const { id, tag } = message.author;
    const member = await getMember(tag, id, guildSf);

    await prisma.member.update({
      where: { id: member.id },
      data: { numMessages: { increment: 1 } },
    });
  },
};

async function getMember(tag: string, userId: string, guildSf: bigint) {
  const sf = BigInt(userId);
  const sf_guildSf = { sf, guildSf };

  const member =
    (await prisma.member.findUnique({ where: { sf_guildSf } })) ??
    (await prisma.member.create({ data: { tag, ...sf_guildSf } }));
  return member;
}
