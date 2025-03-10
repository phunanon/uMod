import { StickerFormatType } from 'discord.js';
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
    needPermit: 'LowDangerChannelConfig',
    async command({ interaction, channelSf, channelFlags }) {
      await interaction.deferReply();

      const blockGifs = !channelFlags?.blockGifs;

      await prisma.channelFlags.update({
        where: { channelSf },
        data: { blockGifs },
      });

      await interaction.editReply(
        `GIFs in this channel will${blockGifs ? '' : ' no longer'} be blocked.`,
      );
    },
  },
  async HandleMessage({ channelFlags, message, isDelete }) {
    if (isDelete || !channelFlags?.blockGifs) return;

    const hasGif = message.attachments.some(a => a.contentType === 'image/gif');
    const hasTenor = message.content.toLowerCase().includes('tenor.com/view');
    const hasGifSticker = message.stickers.some(
      s =>
        s.format === StickerFormatType.APNG ||
        s.format === StickerFormatType.GIF ||
        s.format === StickerFormatType.Lottie,
    );

    if (hasGif || hasTenor || hasGifSticker) {
      await message.delete();
      return 'stop';
    }

    return;
  },
};
