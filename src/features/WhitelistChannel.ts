import { Feature } from '.';
import { prisma } from '../infrastructure';

export const WhitelistChannel: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'whitelist-channel',
      description: 'Disable moderation for current channel',
    });
  },
  Interaction: {
    commandName: 'whitelist-channel',
    moderatorOnly: true,
    async handler({ interaction, channelSf: sf }) {
      await interaction.deferReply();

      const existing = await prisma.channelWhitelist.findFirst({
        where: { sf },
      });

      if (existing) {
        await prisma.channelWhitelist.delete({ where: { id: existing.id } });
        await interaction.editReply('Channel unwhitelisted.');
        return;
      }

      await prisma.channelWhitelist.create({ data: { sf } });

      await interaction.editReply('Channel whitelisted.');
    },
  },
};
