import { ChatInputCommandInteraction } from 'discord.js';
import { Feature, InteractionCtx } from '.';
import { prisma } from '../infrastructure';

const HandleCommand =
  (mode: 'messages' | 'iq') =>
  async (ctx: InteractionCtx<ChatInputCommandInteraction>) => {
    const { interaction, guildSf } = ctx;
    await interaction.deferReply();

    const { id, tag } = interaction.user;
    const member = await getMember(tag, id, guildSf);
    const byIq = mode === 'iq';

    const top10 = byIq
      ? await prisma.$queryRaw<{ id: string; tag: string; iq: number }[]>`
SELECT id, tag, numIqLines, numIqWords / (numIqLines + 1.0) as iq
FROM member
WHERE guildSf = ${guildSf}
AND iq
ORDER BY iq DESC
LIMIT 10;`
      : await prisma.member.findMany({
          where: { guildSf, numMessages: { gt: 0 } },
          select: { id: true, tag: true, numMessages: true },
          orderBy: { numMessages: 'desc' },
          take: 10,
        });

    const userRow = ({ index, tag }: { index: number; tag: string }) => {
      const i = (index + 1).toString().padStart(2, ' ');
      const row = '`' + i + ' ' + (tag === member.tag ? `${tag}` : tag);
      return row.padEnd(22, ' ') + '`';
    };

    const fmt = (x: number) =>
      `${(x / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k`;

    const leaderboard = top10.map((row, index) => {
      const tag = userRow({ index, ...row });
      return 'iq' in row
        ? `${tag} ${Math.floor(row.iq * 100)} IQ`
        : `${tag} ${fmt(row.numMessages)} messages`;
    });

    if (!top10.some(({ id }) => id === member.id)) {
      if (byIq) {
        const iq = member.numIqWords / (member.numIqLines + 1.0);
        const [userRank] = await prisma.$queryRaw<{ rank: BigInt }[]>`
SELECT count(*) as rank
FROM member
WHERE guildSf = ${guildSf}
AND numIqWords / (numIqLines + 1.0) > ${iq};
`;
        const index = Number(userRank?.rank ?? 0);
        const tag = userRow({ index, ...member });
        leaderboard.push('...', `${tag} ${Math.floor(iq * 100)} IQ`);
      } else {
        const userRank = await prisma.member.count({
          where: { numMessages: { gt: member.numMessages } },
        });
        const index = userRank + 1;
        const tag = userRow({ index, ...member });
        leaderboard.push('...', `${tag} ${fmt(member.numMessages)} messages`);
      }
    }

    await interaction.editReply('.\n' + leaderboard.join('\n'));
  };

export const Leaderboard: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'leaderboard',
      description: 'Show the server leaderboard by number of messages',
    });
  },
  Interaction: {
    name: 'leaderboard',
    moderatorOnly: false,
    command: HandleCommand('messages'),
  },
  async HandleMessageCreate({ message, guildSf }) {
    const { id, tag } = message.author;
    const member = await getMember(tag, id, guildSf);

    await prisma.member.update({
      where: { id: member.id },
      data: { numMessages: { increment: 1 } },
    });
  },
};

export const IqLeaderboard: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'iq-leaderboard',
      description: 'Show the server leaderboard by IQ',
    });
  },
  Interaction: {
    name: 'iq-leaderboard',
    moderatorOnly: false,
    command: HandleCommand('iq'),
  },
  async HandleMessageCreate({ message, guildSf }) {
    const { id, tag } = message.author;
    const member = await getMember(tag, id, guildSf);
    const numWords = new Set(message.content.split(/\s+/)).size;
    const numLines = new Set(message.content.split('\n')).size;

    await prisma.member.update({
      where: { id: member.id },
      data: {
        numIqLines: { increment: numLines },
        numIqWords: { increment: numWords },
      },
    });
  },
};

async function getMember(tag: string, userId: string, guildSf: bigint) {
  const userSf = BigInt(userId);
  const userSf_guildSf = { userSf, guildSf };

  const member =
    (await prisma.member.findUnique({ where: { userSf_guildSf } })) ??
    (await prisma.member.create({ data: { tag, ...userSf_guildSf } }));
  return member;
}
