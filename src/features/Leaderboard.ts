import { Feature } from '.';
import { prisma } from '../infrastructure';

type LeaderboardRow<T extends {}> = {
  userSf: bigint;
  tag: string;
  idx: bigint;
} & T;

const userRow = (params: { idx: bigint; tag: string; n: string }) => {
  const { idx, tag, n } = params;
  const i = idx.toString().padStart(2, ' ');
  return `\`${i} ${tag}`.padEnd(22, ' ') + '`' + ` ${n}`;
};

const fmt = (x: number, what: string) =>
  `${(x / 1000).toLocaleString('en-GB', {
    maximumFractionDigits: 1,
  })}k ${what}`;

const MakeLeaderboard = async <T extends {}>(
  userSf: bigint,
  getTop10: () => Promise<LeaderboardRow<T>[]>,
  getForSf: (userSf: bigint) => Promise<LeaderboardRow<T>>,
  fmtRow: (row: LeaderboardRow<T>) => string,
) => {
  const top10 = await getTop10();
  const notInTop10 = !top10.some(x => x.userSf === userSf);
  return [
    ...top10.map(fmtRow),
    ...(notInTop10 ? ['...', fmtRow(await getForSf(userSf))] : []),
  ].join('\n');
};

export const LeaderboardRecorder: Feature = {
  async HandleMessage({ message, guildSf }) {
    const { id, tag } = message.author;
    const member = await getMember(tag, id, guildSf);
    const numWords = new Set(message.content.split(/\s+/)).size;
    const numLines = new Set(message.content.split('\n')).size;

    await prisma.member.update({
      where: { id: member.id },
      data: {
        numMessages: { increment: 1 },
        numIqLines: { increment: numLines },
        numIqWords: { increment: numWords },
        latest: Date.now(),
      },
    });
  },
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
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply();
      const tag = interaction.user.tag;
      type Row = LeaderboardRow<{ numMessages: number }>;
      const getTop10 = async () =>
        await prisma.$queryRaw<Row[]>`
SELECT userSf, tag, numMessages,
ROW_NUMBER() OVER (ORDER BY numMessages DESC) AS idx
FROM member
WHERE guildSf = ${guildSf}
AND numMessages
ORDER BY numMessages DESC
LIMIT 10;`;
      const getForSf = async (userSf: bigint) => {
        const member = await prisma.member.findUnique({
          where: { userSf_guildSf: { userSf, guildSf } },
        });
        const idx = await prisma.member
          .count({
            where: { guildSf, numMessages: { gt: member?.numMessages ?? 0 } },
          })
          .then(x => BigInt(x + 1));
        return { ...(member ?? { userSf, tag, numMessages: 0 }), idx };
      };
      const leaderboard = await MakeLeaderboard(
        userSf,
        getTop10,
        getForSf,
        ({ idx, tag, numMessages: n }) =>
          userRow({ idx, tag, n: fmt(n, 'messages') }),
      );
      await interaction.editReply('.\n' + leaderboard);
    },
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
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply();
      const tag = interaction.user.tag;
      type Row = LeaderboardRow<{ iq: number }>;
      const getTop10 = async () => {
        return await prisma.$queryRaw<Row[]>`
SELECT userSf, tag, numIqWords / (numIqLines + 1.0) as iq,
ROW_NUMBER() OVER (ORDER BY numIqWords / (numIqLines + 1.0) DESC) AS idx
FROM member
WHERE guildSf = ${guildSf}
AND iq
ORDER BY iq DESC
LIMIT 10;`;
      };
      const getForSf = async (userSf: bigint) => {
        const member = await prisma.member.findUnique({
          where: { userSf_guildSf: { userSf, guildSf } },
        });
        const iq = member ? member.numIqWords / (member.numIqLines + 1.0) : 0;
        const idx = await prisma.$queryRaw<[{ idx: number }]>`
SELECT count(*) as idx
FROM member
WHERE guildSf = ${guildSf}
AND numIqWords / (numIqLines + 1.0) > ${iq};
`.then(([{ idx }]) => BigInt(idx) + 1n);
        return { ...(member ?? { userSf, tag }), idx, iq };
      };
      const leaderboard = await MakeLeaderboard(
        userSf,
        getTop10,
        getForSf,
        ({ idx, tag, iq }) =>
          userRow({ idx, tag, n: `${Math.floor(iq * 100)} IQ` }),
      );
      await interaction.editReply('.\n' + leaderboard);
    },
  },
};

export const LoyaltyLeaderboard: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'loyalty-leaderboard',
      description: 'Show the server leaderboard by length of activity',
    });
  },
  Interaction: {
    name: 'loyalty-leaderboard',
    moderatorOnly: false,
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply();
      const tag = interaction.user.tag;
      type Row = LeaderboardRow<{ durationMs: bigint }>;
      const getTop10 = async () => {
        return await prisma.$queryRaw<Row[]>`
SELECT userSf, tag,  latest - strftime('%s', earliest) * 1000 as durationMs,
ROW_NUMBER() OVER (ORDER BY  latest - strftime('%s', earliest) * 1000 DESC) AS idx
FROM member
WHERE guildSf = ${guildSf}
AND latest
ORDER BY durationMs DESC
LIMIT 10;`;
      };
      const getForSf = async (userSf: bigint) => {
        const member = await prisma.member.findUnique({
          where: { userSf_guildSf: { userSf, guildSf } },
        });
        const durationMs = bigintMax(
          member ? member.latest - BigInt(member.earliest.getTime()) : 0n,
          0n,
        );
        const idx = await prisma.$queryRaw<[{ idx: bigint }]>`
SELECT count(*) as idx
FROM member
WHERE guildSf = ${guildSf}
AND latest
AND latest - strftime('%s', earliest) * 1000 > ${durationMs};
`.then(([{ idx }]) => idx + 1n);
        return { ...(member ?? { userSf, tag }), idx, durationMs };
      };
      const leaderboard = await MakeLeaderboard(
        userSf,
        getTop10,
        getForSf,
        ({ idx, tag, durationMs }) =>
          userRow({
            idx,
            tag,
            n: `${Math.ceil(Number(durationMs) / 60_000 / 60 / 24)} days`,
          }),
      );
      await interaction.editReply('.\n' + leaderboard);
    },
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

function bigintMax(a: bigint, b: bigint) {
  return a > b ? a : b;
}
