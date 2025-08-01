import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
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
    needPermit: 'ChannelConfig',
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
    needPermit: 'ChannelConfig',
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
    needPermit: 'QotdApprove',
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
      const { postedAt: latestPostedAt } =
        (await prisma.qotdQuestion.findFirst({
          orderBy: { postedAt: 'desc' },
          select: { postedAt: true },
        })) ?? {};

      const plus1Day = (x: Date) => x.getTime() + 24 * 60 * 60_000;
      const dates = [
        ...(latestPostAt ? [plus1Day(latestPostAt)] : []),
        ...(latestPostedAt ? [plus1Day(latestPostedAt)] : []),
        Date.now(),
      ];
      const postAt = new Date(Math.max(...dates));
      await prisma.qotdQuestion.update({ where: { id }, data: { postAt } });

      const t = Math.floor(postAt.getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      const content =
        interaction.message.content +
        `

**Question approved** by <@${userSf}> at ${now}. Planned post time: <t:${t}:R>`;
      await interaction.editReply({ content, components: [] });
    },
  },
};

export const QotdReject: Feature = {
  Interaction: {
    name: 'qotd-reject',
    needPermit: 'QotdApprove',
    async button({ interaction }) {
      await interaction.deferUpdate();
      const now = Math.floor(Date.now() / 1000);
      await interaction.editReply({
        content: interaction.message.content+`

**Question rejected** by <@${interaction.user.id}> at <t:${now}:R>.`,
        components: [],
      });
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
        new ButtonBuilder()
          .setCustomId(`qotd-reject`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger),
      );

      const splitQuestion = question.split('\n').join('\n> ');
      await auditChannel.send({
        content: `<@${authorSf}> suggested a question:\n> ${splitQuestion}`,
        allowedMentions: { parse: [] },
        components: [row],
      });

      await interaction.editReply(
        'Your question will be reviewed by a moderator and potentially added to the question queue. Thank you!',
      );
    },
  },
};

export const QotdSubscribe: Feature = {
  Interaction: {
    name: 'qotd-subscribe',
    async button({ interaction, guild, member }) {
      await interaction.deferReply({ ephemeral: true });

      const role = await GetQotdRole(guild);

      if (member.roles.cache.has(role.id)) {
        await interaction.editReply(
          'You are already subscribed to QOTD notifications.',
        );
        return;
      }

      try {
        await member.roles.add(role);
      } catch {
        await interaction.editReply('I was unable to give you the QOTD role.');
        return;
      }
      await interaction.editReply(
        'You will now receive notifications for new questions of the day.',
      );
    },
  },
};

export const QotdUnsubscribe: Feature = {
  Interaction: {
    name: 'qotd-unsubscribe',
    async button({ interaction, guild, member }) {
      await interaction.deferReply({ ephemeral: true });

      const role = await GetQotdRole(guild);

      if (!member.roles.cache.has(role.id)) {
        await interaction.editReply(
          'You are not subscribed to QOTD notifications.',
        );
        return;
      }

      try {
        await member.roles.remove(role);
      } catch {
        await interaction.editReply('I was unable to remove the QOTD role.');
        return;
      }
      await interaction.editReply(
        'You will no longer receive notifications for new questions of the day.',
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

  if (postChannel?.type !== ChannelType.GuildText) {
    await prisma.guildQotd.delete({ where: { guildSf } });
    return;
  }

  const role = await GetQotdRole(postChannel.guild);
  const numWaiting = await prisma.qotdQuestion.count({
    where: { AND: { guildSf, postAt: { not: null, gt: new Date() } } },
  });
  const copula = numWaiting === 1 ? 'is' : 'are';
  const plural = numWaiting === 1 ? '' : 's';
  const footer = `There ${copula} ${numWaiting} more question${plural} waiting to be posted.`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('qotd-subscribe')
      .setLabel('Be notified of new questions')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('qotd-unsubscribe')
      .setLabel('Stop receiving notifications')
      .setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setTitle('❓ Question of the Day ❓')
    .setDescription(`## ${question}`)
    .setFooter({ text: footer })
    .setColor('Random');

  await postChannel.send({
    embeds: [embed],
    content: `<@&${role.id}>
Suggest your own questions with \`/suggest-qotd\`.
Asked by <@${authorSf}>.`,
    components: [row],
    allowedMentions: { users: [`${authorSf}`], roles: [role.id] },
  });

  await prisma.qotdQuestion.update({
    where: { id },
    data: { postedAt: new Date() },
  });
}

async function GetQotdRole(guild: Guild) {
  const roles = await guild.roles.fetch();
  const role = [...roles.values()].find(r => r.name === 'QotD pings');
  return role ?? (await guild.roles.create({ name: 'QotD pings' }));
}
