import { Feature } from '.';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const DeleteMessage: Feature = {
  Interaction: {
    name: 'delete-message-*',
    needPermit: ['Member', 'EnforceRule'],
    async button({ interaction, channel }) {
      await interaction.deferUpdate();
      const messageSf = BigInt(interaction.customId.split('-').pop() ?? '');
      const message = await channel.messages
        .fetch(`${messageSf}`)
        .catch(() => null);
      if (!message) {
        await interaction.editReply({
          content: 'Message not found.',
          components: [],
        });
        return;
      }
      await message.delete();
      await interaction.editReply({
        content: 'Message deleted.',
        components: [],
      });
    },
  },
};

export const DeleteMessageRow = (messageSf: bigint) => {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`delete-message-${messageSf}`)
      .setLabel('Delete the offending message')
      .setStyle(ButtonStyle.Danger),
  );
};
