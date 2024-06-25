import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

const latestAuthorSf = new Map<bigint, bigint>();
const sort = (x: bigint, y: bigint) =>
  [x, y].toSorted((a, b) => Number(a - b)) as [bigint, bigint];

export const Acquaintances: Feature = {
  async Init(commands) {
    commands.create({
      name: 'acquaintances',
      description: 'List likely acquaintances of a user',
      options: [
        {
          name: 'user',
          description: 'User to list acquaintances for',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'acquaintances',
    moderatorOnly: false,
    async command({ interaction }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const sf = BigInt(user.id);

      const [userASf, userBSf] = [sf, sf];

      const acquaintances = await prisma.acquaintance.findMany({
        where: { OR: [{ userASf }, { userBSf }] },
        orderBy: { count: 'desc' },
        take: 3,
      });

      const users = acquaintances.map(({ userASf, userBSf, count }) => ({
        sf: userASf === sf ? userBSf : userASf,
        count,
      }));

      await interaction.editReply({
        embeds: [
          {
            title: `Acquaintances of ${user.displayName}`,
            description: users
              .map(
                ({ sf, count }, n) => `${n + 1}. <@${sf}> - ${count} messages`,
              )
              .join('\n'),
          },
        ],
      });
    },
  },
  async HandleMessageCreate({ channelSf, userSf }) {
    const latest = latestAuthorSf.get(channelSf);
    latestAuthorSf.set(channelSf, userSf);
    if (!latest || latest === userSf) return;

    const [userASf, userBSf] = sort(latest, userSf);

    await prisma.acquaintance.upsert({
      where: { userASf_userBSf: { userASf, userBSf } },
      update: { count: { increment: 1 } },
      create: { userASf, userBSf, count: 1 },
    });
  },
};
