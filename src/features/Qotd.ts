import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';
import { GuildQotd, QotdQuestion } from '@prisma/client';

export const QotdEnable: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'configure-qotd',
      description: 'Enable or modify question of the day in this server',
      options: [
        {
          name: 'post-to',
          description: 'The channel to send QOTDs in',
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
        {
          name: 'suggestions-to',
          description: 'The channel to send QOTD suggestions to',
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
      ],
    });
    setInterval(QotdTick, 30_000);
  },
  Interaction: {
    name: 'configure-qotd',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply();

      const postTo = interaction.options.getChannel('post-to', true);
      const auditTo = interaction.options.getChannel('suggestions-to', true);
      const postChannelSf = BigInt(postTo.id);
      const auditChannelSf = BigInt(auditTo.id);

      await prisma.guildQotd.upsert({
        where: { guildSf },
        create: { guildSf, postChannelSf, auditChannelSf },
        update: { postChannelSf, auditChannelSf },
      });

      await interaction.editReply('QOTD enabled or reconfigured.');
    },
  },
};

export const QotdDisable: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'disable-qotd',
      description: 'Disable question of the day in this server',
    });
  },
  Interaction: {
    name: 'disable-qotd',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply();

      const existing = await prisma.guildQotd.findUnique({
        where: { guildSf },
      });

      if (existing) {
        await prisma.guildQotd.delete({ where: { guildSf } });
        await interaction.editReply('QOTD disabled.');
      } else {
        await interaction.editReply('QOTD was not enabled.');
      }
    },
  },
};

export const QotdApprove: Feature = {
  Interaction: {
    name: 'qotd-approve-*',
    moderatorOnly: true,
    async button({ interaction, userSf }) {
      await interaction.deferUpdate();

      const id = parseInt(interaction.customId.split('-').slice(-1)[0] ?? '0');
      const question = await prisma.qotdQuestion.findUnique({ where: { id } });

      if (!question) {
        await interaction.followUp({
          content: 'This question is no longer in the database.',
          ephemeral: true,
        });
        await interaction.message.delete();
        return;
      }

      const { postAt: latestPostAt } =
        (await prisma.qotdQuestion.findFirst({
          orderBy: { postAt: 'desc' },
          select: { postAt: true },
        })) ?? {};

      const postAt = latestPostAt
        ? new Date(latestPostAt.getTime() + 24 * 60 * 60_000)
        : new Date();
      await prisma.qotdQuestion.update({ where: { id }, data: { postAt } });

      const t = Math.floor(postAt.getTime() / 1000);
      const content =
        interaction.message.content +
        `

**Question approved** by <@${userSf}>. Planned post time: <t:${t}:R>`;
      await interaction.editReply({ content, components: [] });
    },
  },
};

export const QotdSuggest: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'suggest-qotd',
      description: 'Suggest a question of the day',
      options: [
        {
          name: 'question',
          description: 'The question',
          type: ApplicationCommandOptionType.String,
          required: true,
          minLength: 10,
          maxLength: 200,
        },
      ],
    });
  },
  Interaction: {
    name: 'suggest-qotd',
    moderatorOnly: false,
    async command({ interaction, guild, guildSf, userSf: authorSf }) {
      await interaction.deferReply({ ephemeral: true });

      const question = interaction.options.getString('question', true);

      const config = await prisma.guildQotd.findUnique({ where: { guildSf } });
      const auditChannel =
        config && (await guild.channels.fetch(`${config.auditChannelSf}`));

      if (!auditChannel?.isTextBased()) {
        await interaction.editReply('QOTD is disabled in this server.');
        return;
      }

      const { id } = await prisma.qotdQuestion.create({
        data: { guildSf, authorSf, question },
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`qotd-approve-${id}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
      );

      await auditChannel.send({
        content: `<@${authorSf}> suggested a question:\n> ${question}`,
        allowedMentions: { parse: [] },
        components: [row],
      });

      await interaction.editReply(
        'Your question will be reviewed by a moderator and potentially added to the question queue. Thank you!',
      );
    },
  },
};

async function QotdTick() {
  const questions = await prisma.qotdQuestion.findMany({
    where: { postAt: { lte: new Date() }, postedAt: null },
    include: { Config: true },
  });

  for (const question of questions) {
    await PostQuestion(question);
  }
}

async function PostQuestion(q: QotdQuestion & { Config: GuildQotd }) {
  const { id, guildSf, authorSf, question, Config } = q;
  const postChannel = await client.channels.fetch(`${Config.postChannelSf}`);

  if (!postChannel?.isTextBased()) {
    await prisma.guildQotd.delete({ where: { guildSf } });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('❓ Question of the Day ❓')
    .setDescription(`## ${question}`)
    .setColor('Random');

  await postChannel.send({
    embeds: [embed],
    content: `Suggest your own question with \`/suggest-qotd\`.
This question was asked by <@${authorSf}>.`,
    allowedMentions: { users: [`${authorSf}`] },
  });

  await prisma.qotdQuestion.update({
    where: { id },
    data: { postedAt: new Date() },
  });
}
