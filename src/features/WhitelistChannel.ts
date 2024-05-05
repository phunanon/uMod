import { Feature, InteractionGuard } from '.';
import { prisma } from '../infrastructure';

export const WhitelistChannel: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'whitelist-channel',
      description: 'Disable moderation for current channel.',
    });
  },
  async HandleInteractionCreate(interaction) {
    const { chatInteraction, channelSf: sf } =
      (await InteractionGuard(interaction, 'whitelist-channel', true)) ?? {};
    if (!chatInteraction || !sf) return;

    const existing = await prisma.channelWhitelist.findFirst({ where: { sf } });
    if (existing) {
      await prisma.channelWhitelist.delete({ where: { id: existing.id } });
      await chatInteraction.reply('Channel unwhitelisted.');
      return;
    }

    await prisma.channelWhitelist.create({ data: { sf } });

    await chatInteraction.reply('Channel whitelisted.');
  },
};
