import { Feature } from '.';
import { prisma } from '../infrastructure';

const daysWait = 3;
const channelSemaphore = new Set<bigint>();

export const AutoHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'auto-here',
      description: `Toggle pinging @here if this channel is inactive for more than ${daysWait} days`,
    });
  },
  async HandleMessageCreate({ channelSf, channelFlags, channel }) {
    if (channelSemaphore.has(channelSf)) return;
    channelSemaphore.add(channelSf);
    const activityAt = new Date();
    try {
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
      if (days > daysWait) {
        const plural = days > 1 ? 's' : '';
        await channel.send({
          content: `@here This channel had been inactive for ${days} day${plural}!`,
          allowedMentions: { parse: ['everyone'] },
        });
      }
    } finally {
      channelSemaphore.delete(channelSf);
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
