import { ApplicationCommandOptionType } from 'discord.js';
import { Feature, InteractionGuard } from '.';
import { log } from '../infrastructure';

export const Echo: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'echo',
      description: 'Sends an anonymous message in the channel.',
      options: [
        {
          name: 'content',
          description: 'The content of the message.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  async HandleInteractionCreate(interaction) {
    const { chatInteraction, channel } =
      (await InteractionGuard(interaction, 'echo', false)) ?? {};
    if (!chatInteraction || !channel) return;

    const content = chatInteraction.options.get('content', true).value;

    if (typeof content !== 'string') {
      await chatInteraction.reply('Invalid content.');
      return;
    }

    await chatInteraction.reply({
      content: 'Your message should be posted shortly.',
      ephemeral: true,
    });

    await channel.send({ content, allowedMentions: { parse: [] } });

    log(`Echo from ${chatInteraction.user.id}`);
  },
};
