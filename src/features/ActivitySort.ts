import { Feature, InteractionGuard, MessageGuard } from '.';
import { prisma } from '../infrastructure';

export const ActivitySort: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'activity-sort',
      description: 'Toggle sorting channels in category by latest activity',
    });
  },
  async HandleInteractionCreate(interaction) {
    const x = await InteractionGuard(interaction, 'activity-sort', true);
    if (!x) return;
    const { chatInteraction, channel, guildSf } = x;
    await chatInteraction.deferReply();

    if (!channel.parentId) {
      await chatInteraction.editReply('Invalid category');
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
      await chatInteraction.editReply('Activity sort disabled');
      return;
    }

    await prisma.activitySort.create({
      data: { guildSf, categorySf },
    });

    await chatInteraction.editReply('Activity sort enabled');
  },
  async HandleMessageCreate(message) {
    const x = await MessageGuard(message);
    if (!x) return;
    const { guildSf, channel } = x;
    const category = channel.parent?.id;

    if (!category || !channel.position) return;

    const sort = await prisma.activitySort.findUnique({
      where: { guildSf_categorySf: { guildSf, categorySf: BigInt(category) } },
    });

    if (!sort) return;

    await channel.setPosition(0);
  },
};
