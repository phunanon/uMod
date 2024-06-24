import { Feature } from '.';
import { prisma } from '../infrastructure';

export const BlockGifs: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'block-gifs',
      description: 'Block gifs in the channel',
    });
  },
  Interaction: {
    name: 'block-gifs',
    moderatorOnly: true,
    async command({ interaction, channelSf }) {
      await interaction.deferReply();

      const flags = await prisma.channelFlags.findUnique({
        where: { channelSf },
      });

      const blockGifs = !flags?.blockGifs;

      await prisma.channelFlags.upsert({
        where: { channelSf },
        create: { channelSf, blockGifs },
        update: { blockGifs },
      });

      await interaction.editReply(
        `GIFs in this channel will${blockGifs ? '' : ' no longer'} be blocked.`,
      );
    },
  },
  async HandleMessage({ channelSf, message, isDelete }) {
    if (isDelete) return;
    const existing = await prisma.channelFlags.findUnique({
      where: { channelSf },
    });

    if (!existing?.blockGifs) return;

    const hasGif = message.attachments.some(a => a.contentType === 'image/gif');
    const hasTenor = message.content.toLowerCase().includes('tenor.com/view');

    if (hasGif || hasTenor) {
      await message.delete();
      return 'stop';
    }

    return;
  },
};
