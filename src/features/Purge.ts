import { ApplicationCommandOptionType } from 'discord.js';
import { Feature, InteractionGuard } from '.';

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
  async HandleInteractionCreate(interaction) {
    const { chatInteraction, channel } =
      (await InteractionGuard(interaction, 'purge', true)) ?? {};
    if (!chatInteraction || !channel) return;

    await chatInteraction.reply('Deleting messages...');

    const limit = chatInteraction.options.get('count', true).value;
    if (typeof limit !== 'number') {
      await chatInteraction.editReply('Invalid number.');
      return;
    }

    if (limit < 1 || limit > 100) {
      await chatInteraction.editReply('Amount must be between 1 and 100.');
      return;
    }

    const before = chatInteraction.id;
    const messages = await channel.messages.fetch({ limit, before });
    await channel.bulkDelete(messages);
    await chatInteraction.editReply(`Deleted ${messages.size} messages.`);
  },
};
