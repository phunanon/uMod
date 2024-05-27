import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { log } from '../infrastructure';

export const Echo: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'echo',
      description: 'Sends an anonymous message in the channel',
      options: [
        {
          name: 'content',
          description: 'The content of the message',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'echo',
    moderatorOnly: false,
    async command({ interaction, channel }) {
      const content = interaction.options.get('content', true).value;

      if (typeof content !== 'string') {
        await interaction.reply('Invalid content.');
        return;
      }

      await interaction.reply({
        content: 'Your message should be posted shortly.',
        ephemeral: true,
      });

      await channel.send({ content, allowedMentions: { parse: [] } });

      log(`Echo from ${interaction.user.id}`);
    },
  },
};
