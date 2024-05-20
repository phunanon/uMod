import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const Censor: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'censor',
      description: 'Censor a word server-wide with a replacement',
      options: [
        {
          name: 'word',
          description: 'The word to censor',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'censored',
          description: 'The censored form (* will be escaped)',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    commandName: 'censor',
    moderatorOnly: true,
    async handler({ guildSf, interaction }) {
      await interaction.deferReply();

      const word = interaction.options.getString('word')?.toLowerCase();
      const unescaped = interaction.options.getString('censored');

      if (!word || !unescaped) {
        await interaction.editReply('word or its censored form missing.');
        return;
      }

      const censored = unescaped.replaceAll('*', '\\*');
      await prisma.censor.create({ data: { guildSf, word, censored } });

      await interaction.editReply(`New censored word: ${censored}`);
    },
  },
  async HandleMessage({ guildSf, userSf, channel, message }) {
    const words = message.content
      .toLowerCase()
      .replaceAll(/[^a-z ]/g, '')
      .split(' ');
    const censors = await prisma.censor.findMany({
      where: { guildSf, word: { in: words } },
    });

    if (!censors.length) return;

    const content = censors.reduce(
      (sum, { word, censored }) => sum.replaceAll(word, censored),
      message.content,
    );
    await channel.send({
      content: `<@${userSf}>: ${content}`,
      allowedMentions: { parse: [] },
    });
    await message.delete();

    return 'stop';
  },
};

export const DeleteCensor: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'delete-censor',
      description: 'Delete a previously censored word',
      options: [
        {
          name: 'word',
          description: 'The word or its censored form',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    commandName: 'delete-censor',
    moderatorOnly: true,
    async handler({ guildSf, interaction }) {
      await interaction.deferReply();

      const unescaped = interaction.options.getString('word');

      if (!unescaped) {
        await interaction.editReply('Word was not specified');
        return;
      }

      const word = unescaped.replaceAll('*', '\\*');
      const { count } = await prisma.censor.deleteMany({
        where: { guildSf, OR: [{ word }, { censored: word }] },
      });

      await interaction.editReply(`${count} censored word(s) deleted`);
    },
  },
};
