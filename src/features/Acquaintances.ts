import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

const latestAuthorSf = new Map<bigint, bigint>();
const sort = (a: bigint, b: bigint) => Number(a - b);

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
    async command({ interaction, guild, userSf: sf1 }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const sf2 = BigInt(user.id);

      const [userASf, userBSf] = [sf1, sf2].sort(sort) as [bigint, bigint];

      const acquaintances = await prisma.acquaintance.findMany({
        where: { OR: [{ userASf }, { userBSf }] },
        orderBy: { count: 'desc' },
        take: 3,
      });

      const users = acquaintances.map(({ userASf, userBSf, count }) => ({
        sf: userASf === sf1 ? userBSf : userASf,
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
    if (latest === userSf) return;
    if (!latest) {
      latestAuthorSf.set(channelSf, userSf);
      return;
    }

    const [userASf, userBSf] = [latest, userSf].sort(sort) as [bigint, bigint];

    await prisma.acquaintance.upsert({
      where: { userASf_userBSf: { userASf, userBSf } },
      update: { count: { increment: 1 } },
      create: { userASf, userBSf, count: 1 },
    });

    latestAuthorSf.set(channelSf, userSf);
  },
};
