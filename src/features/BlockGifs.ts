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
    commandName: 'block-gifs',
    moderatorOnly: true,
    async handler({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();
      const guildSf_channelSf = { guildSf, channelSf };

      const existing = await prisma.channelFlags.findUnique({
        where: { guildSf_channelSf },
      });

      const blockGifs = existing?.blockGifs ? false : true;

      await prisma.channelFlags.upsert({
        where: { guildSf_channelSf },
        create: { guildSf, channelSf, blockGifs: true },
        update: { blockGifs },
      });

      await interaction.editReply(
        `GIFs in this channel will${blockGifs ? '' : ' no longer'} be blocked.`,
      );
    },
  },
  async HandleMessage({ guildSf, channelSf, message }) {
    const guildSf_channelSf = { guildSf, channelSf };

    const existing = await prisma.channelFlags.findUnique({
      where: { guildSf_channelSf },
    });

    if (!existing?.blockGifs) return;

    const hasGif = message.attachments.some(a => a.contentType === 'image/gif');
    const hasTenor = message.content
      .toLowerCase()
      .includes('tenor.com/view');
    
    if (hasGif || hasTenor) {
      await message.delete();
    }

    return;
  },
};
