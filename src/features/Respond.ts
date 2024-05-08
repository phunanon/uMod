import { ApplicationCommandOptionType } from 'discord.js';
import { Feature, InteractionGuard, MessageGuard } from '.';
import { prisma } from '../infrastructure';

export const Respond: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'response',
      description: 'Set up or delete a response for a Regex pattern.',
      options: [
        {
          name: 'pattern',
          description: 'A Regex pattern',
          type: ApplicationCommandOptionType.String,
        },
        {
          name: 'response',
          description: 'The response to send when the pattern is matched.',
          type: ApplicationCommandOptionType.String,
        },
      ],
    });
  },
  async HandleInteractionCreate(interaction) {
    const { chatInteraction, guildSf } =
      (await InteractionGuard(interaction, 'response', true)) ?? {};
    if (!chatInteraction || !guildSf) return;

    const patternVal = chatInteraction.options.get('pattern')?.value;
    const responseVal = chatInteraction.options.get('response')?.value;
    if (!patternVal && !responseVal) {
      await chatInteraction.reply({
        content: 'Provide a pattern and a response, or either to delete.',
        ephemeral: true,
      });
      return;
    }

    await chatInteraction.deferReply();

    const [pattern, response] = [patternVal, responseVal].map(x =>
      x ? `${x}` : undefined,
    );

    if (pattern && response) {
      await prisma.response.create({
        data: { pattern, response, guildSf },
      });
      await chatInteraction.editReply('Response set.');
      return;
    }

    const existing = await prisma.response.findFirst({
      where: { guildSf, pattern, response },
    });

    if (!existing) {
      await chatInteraction.editReply('No response found.');
      return;
    }

    await prisma.response.delete({ where: { id: existing.id } });

    await chatInteraction.editReply('Response deleted.');
  },
  async HandleMessageCreate(message) {
    const { guildSf } = (await MessageGuard(message)) ?? {};
    if (!guildSf) return;

    const responses = await prisma.response.findMany({ where: { guildSf } });

    for (const { pattern, response } of responses) {
      const regex = new RegExp(pattern);
      if (!regex.test(message.content)) continue;
      await message.reply(response);
    }
  },
};
