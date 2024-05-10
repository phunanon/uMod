import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';

export const Purge: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'purge',
      description: 'Delete messages in the channel.',
      options: [
        {
          name: 'count',
          description: 'The number of messages to delete.',
          type: ApplicationCommandOptionType.Integer,
          required: true,
          minValue: 1,
          maxValue: 100,
        },
      ],
    });
  },
  Interaction: {
    commandName: 'purge',
    moderatorOnly: true,
    async handler({ interaction, channel }) {
      await interaction.reply('Deleting messages...');

      const limit = interaction.options.get('count', true).value;
      if (typeof limit !== 'number') {
        await interaction.editReply('Invalid number.');
        return;
      }

      if (limit < 1 || limit > 100) {
        await interaction.editReply('Amount must be between 1 and 100.');
        return;
      }

      const before = interaction.id;
      const messages = await channel.messages.fetch({ limit, before });
      await channel.bulkDelete(messages);
      await interaction.editReply(`Deleted ${messages.size} messages.`);
    },
  },
};
