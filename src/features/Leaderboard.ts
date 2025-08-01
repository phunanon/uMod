import { Feature } from '.';
import { prisma } from '../infrastructure';
import { GuildLevelCalculator } from './GuildLevels';

//TODO: vc minutes leaderboard (Member.vcMinutes)

type LeaderboardRow<T extends {} = {}> = {
  userSf: bigint;
  tag: string;
  idx: bigint;
} & T;

const userRow = (params: { idx: bigint; tag: string; n: string }) => {
  const { idx, tag, n } = params;
  const i = idx.toString().padStart(2, ' ');
  const maxTagLength = 16;
  const truncTag =
    tag.length > maxTagLength ? tag.slice(0, maxTagLength - 1) + '-' : tag;
  return `\`${i} ${truncTag}`.padEnd(maxTagLength + 4, ' ') + '`' + ` ${n}`;
};

const fmt = (x: number, what: string) =>
  x < 1000
    ? `${x} ${what}`
    : `${(x / 1000).toLocaleString('en-GB', {
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
  async HandleMessageCreate({ message, guildSf }) {
    const { content, author } = message;
    const ignoreStrings = ['`', '>', '\n-'];
    if (ignoreStrings.some(str => content.includes(str))) return;
    const numLines = new Set(content.split('\n')).size;
    if (numLines > 10) return;
    const numWords = new Set(content.split(/\s+/)).size;
    //People who talk too much are penalised linearly
    const adjustedNumWords =
      numWords > 64 ? Math.max(128 - numWords, 0) : numWords;
    if (adjustedNumWords < 2) return;

    const { id, tag } = author;
    const member = await getMember(tag, id, guildSf);

    await prisma.member.update({
      where: { id: member.id },
      data: {
        numMessages: { increment: 1 },
        numIqLines: { increment: numLines },
        numIqWords: { increment: adjustedNumWords },
        latest: Date.now(),
        tag,
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
AND present
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
      const guildLevel = await GuildLevelCalculator(guildSf);
      const leaderboard = await MakeLeaderboard(
        userSf,
        getTop10,
        getForSf,
        ({ idx, tag, numMessages: n }) =>
          userRow({
            idx,
            tag,
            n: fmt(n, '') + (guildLevel ? ` (lvl ${guildLevel.f(n)})` : ''),
          }),
      );
      await interaction.editReply(
        'Lists members by number of messages sent.\n' + leaderboard,
      );
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
AND numIqLines > 16
AND present
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
AND numIqLines > 16
AND numIqWords / (numIqLines + 1.0) > ${iq}
AND present;
`.then(([{ idx }]) => BigInt(idx) + 1n);
        return { ...(member ?? { userSf, tag }), idx, iq };
      };
      const { floor } = Math;
      const leaderboard = await MakeLeaderboard(
        userSf,
        getTop10,
        getForSf,
        ({ idx, tag, iq }) =>
          userRow({ idx, tag, n: `${floor(iq * 100).toLocaleString()}` }),
      );
      await interaction.editReply(
        'Lists members by IQ (roughly based on length of messages).\n' +
          leaderboard,
      );
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
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply();
      const tag = interaction.user.tag;
      type Row = LeaderboardRow<{ durationMs: bigint }>;
      const getTop10 = async () => {
        return await prisma.$queryRaw<Row[]>`
SELECT userSf, tag,  latest - earliest as durationMs,
ROW_NUMBER() OVER (ORDER BY  latest - earliest DESC) AS idx
FROM member
WHERE guildSf = ${guildSf}
AND latest
AND present
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
AND present
AND latest - earliest > ${durationMs};
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
            n: `${Math.ceil(
              Number(durationMs) / 60_000 / 60 / 24,
            ).toLocaleString()} days`,
          }),
      );
      await interaction.editReply(
        'Lists members who have been active in this server for the longest time.\n' +
          leaderboard,
      );
    },
  },
};

export const AgeLeaderboard: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'age-leaderboard',
      description: 'Show the server leaderboard by account age',
    });
  },
  Interaction: {
    name: 'age-leaderboard',
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply();
      const tag = interaction.user.tag;
      const getTop10 = async () => {
        return await prisma.$queryRaw<LeaderboardRow[]>`
SELECT userSf, tag, ROW_NUMBER() OVER (ORDER BY userSf ASC) AS idx
FROM member
WHERE guildSf = ${guildSf}
AND present
ORDER BY userSf ASC
LIMIT 10;`;
      };
      const getForSf = async (userSf: bigint) => {
        const member = await prisma.member.findUnique({
          where: { userSf_guildSf: { userSf, guildSf } },
        });
        const idx = await prisma.$queryRaw<[{ idx: bigint }]>`
SELECT count(*) as idx
FROM member
WHERE guildSf = ${guildSf}
AND present
AND userSf < ${userSf};
`.then(([{ idx }]) => idx + 1n);
        return { ...(member ?? { userSf, tag }), idx };
      };
      const leaderboard = await MakeLeaderboard(
        userSf,
        getTop10,
        getForSf,
        ({ idx, tag, userSf }) => {
          const DISCORD_EPOCH = 1_420_070_400_000n;
          const epochMsAgo = BigInt(Date.now()) - DISCORD_EPOCH;
          const userSfMsAgo = epochMsAgo - (userSf >> 22n);
          const days = Math.ceil(Number(userSfMsAgo / 60_000n) / 60 / 24);
          return userRow({ idx, tag, n: `${days.toLocaleString()} days` });
        },
      );
      await interaction.editReply(
        `Lists members by Discord account age.\n${leaderboard}`,
      );
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
