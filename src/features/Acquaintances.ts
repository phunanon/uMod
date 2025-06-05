import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { friendliestMembers } from '@prisma/client/sql';

const latestAuthorSf = new Map<bigint, bigint>();
const sort = (x: bigint, y: bigint) =>
  [x, y].toSorted((a, b) => Number(a - b)) as [bigint, bigint];

export const Acquaintances: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'acquaintances',
      description: 'List friendliest server members or acquaintances of a user',
      options: [
        {
          name: 'user',
          description: 'User to list acquaintances for',
          type: ApplicationCommandOptionType.User,
          required: false,
        },
      ],
    });
  },
  Interaction: {
    name: 'acquaintances',
    async command({ interaction, guildSf }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user');

      if (!user) {
        const query = friendliestMembers(guildSf);
        const results = await prisma.$queryRawTyped(query);
        const description =
          'Those who have chatted with the most people:\n' +
          results
            .map(({ userSf, friendliness }, n) => {
              const f = Number(friendliness).toLocaleString();
              return `${n + 1}. <@${userSf}> - ${f} people`;
            })
            .join('\n');
        await interaction.editReply({
          embeds: [{ title: `Friendliest server members`, description }],
        });
        return;
      }

      const { id, displayName } = user;
      const sf = BigInt(id);

      const [userASf, userBSf] = [sf, sf];

      const acquaintances = await prisma.acquaintance.findMany({
        where: { guildSf, OR: [{ userASf }, { userBSf }] },
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
            title: `Acquaintances of ${displayName}`,
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
  async HandleMessageCreate({ guildSf, channelSf, userSf }) {
    const latest = latestAuthorSf.get(channelSf);
    latestAuthorSf.set(channelSf, userSf);
    if (!latest || latest === userSf) return;

    const [userASf, userBSf] = sort(latest, userSf);

    await prisma.acquaintance.upsert({
      where: { guildSf_userASf_userBSf: { guildSf, userASf, userBSf } },
      update: { count: { increment: 1 } },
      create: { guildSf, userASf, userBSf, count: 1 },
    });
  },
};
