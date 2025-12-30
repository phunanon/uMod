import { Feature } from '.';
import { prisma } from '../infrastructure';

export const ActivitySort: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'activity-sort',
      description: 'Toggle sorting channels in category by latest activity',
    });
  },
  Interaction: {
    name: 'activity-sort',
    needPermit: 'ChannelConfig',
    async command({ interaction, guildSf, channel }) {
      await interaction.deferReply();

      if (!channel.parentId) {
        await interaction.editReply('Invalid category');
        return;
      }

      const categorySf = BigInt(channel.parentId);

      const existing = await prisma.activitySort.findFirst({
        where: { categorySf },
      });

      if (existing) {
        await prisma.activitySort.delete({
          where: { guildSf_categorySf: { guildSf, categorySf } },
        });
        await interaction.editReply('Activity sort disabled');
        return;
      }

      await prisma.activitySort.create({ data: { guildSf, categorySf } });

      await interaction.editReply('Activity sort enabled');
    },
  },
  async HandleMessageCreate({ guildSf, channel }) {
    const category = channel.parent?.id;

    if (!category || !('position' in channel) || !channel.position) return;

    const sort = await prisma.activitySort.findUnique({
      where: { guildSf_categorySf: { guildSf, categorySf: BigInt(category) } },
    });

    if (!sort) return;

    await channel.setPosition(0);
  },
};
