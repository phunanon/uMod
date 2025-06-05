import { Feature } from '.';
import { prisma } from '../infrastructure';

export const AutoHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'auto-here',
      description: 'Toggle auto-@here for this channel',
    });
  },
  async HandleMessageCreate({ channelSf, channelFlags, channel }) {
    const activityAt = new Date();
    await prisma.channelFlags.update({
      where: { channelSf },
      data: { activityAt },
    });
    if (!channelFlags.autoHere) return;
    //If longer than a day, send @here
    const days = Math.floor(
      (activityAt.getTime() - channelFlags.activityAt.getTime()) /
        (60_000 * 60 * 24),
    );
    if (days) {
      const plural = days > 1 ? 's' : '';
      await channel.send({
        content: `@here This channel had been inactive for ${days} day${plural}!`,
        allowedMentions: { parse: ['everyone'] },
      });
    }
  },
  Interaction: {
    name: 'auto-here',
    needPermit: 'ChannelConfig',
    async command({ interaction, channelSf }) {
      const channel = await prisma.channelFlags.findUnique({
        where: { channelSf },
      });

      if (!channel) {
        await interaction.reply({
          content: 'Channel not found.',
          ephemeral: true,
        });
        return;
      }

      const newAutoHere = !channel.autoHere;
      await prisma.channelFlags.update({
        where: { channelSf },
        data: { autoHere: newAutoHere },
      });

      const status = newAutoHere ? 'enabled' : 'disabled';
      await interaction.reply({
        content: `Auto-@here is now ${status} for this channel.`,
        ephemeral: true,
      });
    },
  },
};
