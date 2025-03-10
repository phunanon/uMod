import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { AlertEvent, HandleAlert } from './Alert';

const maxValue = 32;

export const Purge: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'purge',
      description: `Delete latest up to ${maxValue} messages in the channel`,
      options: [
        {
          name: 'count',
          description: 'The number of messages for potential deletion',
          type: ApplicationCommandOptionType.Integer,
          required: true,
          minValue: 1,
          maxValue,
        },
        {
          name: 'user',
          description: 'A specific user to delete messages of',
          type: ApplicationCommandOptionType.User,
        },
      ],
    });
  },
  Interaction: {
    name: 'purge',
    needPermit: 'ChannelMessages',
    async command({ interaction, channel, guildSf, userSf }) {
      await interaction.reply({
        content: 'Deleting messages...',
        ephemeral: true,
      });

      const limit = interaction.options.get('count', true).value;
      if (typeof limit !== 'number') {
        await interaction.editReply('Invalid number.');
        return;
      }

      if (limit < 1 || limit > maxValue) {
        await interaction.editReply(`Must be between 1 and ${maxValue}.`);
        return;
      }

      const user = interaction.options.getUser('user');

      const before = interaction.id;
      const messages = (await channel.messages.fetch({ limit, before })).filter(
        m => !user || m.author.id === user.id,
      );
      await channel.bulkDelete(messages);
      await interaction.editReply(`Deleted ${messages.size} messages.`);

      await HandleAlert({
        guildSf,
        userSf,
        event: AlertEvent.Audit,
        content: `Deleted ${messages.size} messages in <#${channel.id}>.`,
      });
    },
  },
};
