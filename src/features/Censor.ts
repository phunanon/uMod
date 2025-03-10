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
          required: false,
        },
        {
          name: 'ban',
          description: 'Whether to ban the user for using the word',
          type: ApplicationCommandOptionType.Boolean,
          required: false,
        },
      ],
    });
  },
  Interaction: {
    name: 'censor',
    needPermit: 'ChannelConfig',
    async command({ guildSf, interaction }) {
      await interaction.deferReply();

      const word = interaction.options.getString('word', true).toLowerCase();
      const unescaped =
        interaction.options.getString('censored', false) ??
        word.replaceAll(/./g, '\*');
      const ban = interaction.options.getBoolean('ban', false) ?? undefined;

      const censored = unescaped.replaceAll('*', '\\*');
      await prisma.censor.create({ data: { guildSf, word, censored, ban } });

      await interaction.editReply(`New censored word: ${censored}`);
    },
  },
  async HandleMessage(ctx) {
    const { channel, message, isDelete, unmoddable, channelFlags } = ctx;
    const { guildSf, userSf } = ctx;
    if (isDelete || unmoddable) return;
    if (channelFlags?.censor === false) return;

    const words = message.content
      .toLowerCase()
      .replaceAll(/[^a-z ]/g, '')
      .split(' ');
    const censors = await prisma.censor.findMany({
      where: { guildSf, word: { in: words } },
    });

    if (!censors.length) return;

    const banned = censors.filter(({ ban }) => ban);
    if (banned.length) {
      try {
        await message.member?.ban({
          reason: 'Used censored word/s: ' + banned.join(', '),
        });
        await channel.send('**Banned for using a forbidden word**');
        await message.delete();
        return 'stop';
      } finally {
      }
    }

    const rx = (word: string) =>
      new RegExp(`\\b${[...word].join('.?')}\\b`, 'gi');
    const content = censors.reduce(
      (sum, { word, censored }): string => sum.replaceAll(rx(word), censored),
      message.content,
    );
    await channel.send({
      content: `<@${userSf}>: ${content}`,
      allowedMentions: { parse: [] },
      files: message.attachments.map(a => a.url),
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
    name: 'delete-censor',
    needPermit: 'ChannelConfig',
    async command({ guildSf, interaction }) {
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
