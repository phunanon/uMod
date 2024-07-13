import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Feature } from '.';
import {
  client,
  log,
  prisma,
  TryFetchChannel,
  TryFetchMessage,
} from '../infrastructure';
import { DeleteMessageRow } from './DeleteMessage';

export const ConfessionsHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'confessions-here',
      description: 'Use this channel for anonymous confessions',
    });

    const flags = await prisma.channelFlags.findMany({
      where: { confessMessage: { not: null } },
      select: { channelSf: true },
    });
    for (const { channelSf } of flags) {
      const channel = await TryFetchChannel(channelSf);
      if (!channel?.isTextBased()) {
        await prisma.channelFlags.updateMany({
          where: { channelSf },
          data: { confessMessage: null },
        });
      } else {
        await RenewStickyMessage(channel);
      }
    }
  },
  Interaction: {
    name: 'confessions-here',
    moderatorOnly: false,
    async command({ interaction, channel, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const { id, confessMessage } =
        (await prisma.channelFlags.findFirst({
          where: { channelSf, confessMessage: { not: null } },
        })) ?? {};

      if (confessMessage) {
        await prisma.channelFlags.update({
          where: { id },
          data: { confessMessage: null },
        });
        await interaction.editReply(
          'Confessions for this channel have been disabled.',
        );
        return;
      }

      await RenewStickyMessage(channel);

      await interaction.editReply(
        'Confessions for this channel have been enabled.',
      );
    },
  },
};

export const Confess: Feature = {
  Interaction: {
    name: 'confess',
    moderatorOnly: false,
    async button({ interaction, guildSf, userSf }) {
      const { confessMute } =
        (await prisma.member.findUnique({
          where: { userSf_guildSf: { userSf, guildSf } },
          select: { confessMute: true },
        })) ?? {};

      if (confessMute) {
        await interaction.reply({
          content: 'You are muted from using this feature.',
          ephemeral: true,
        });
        return;
      }

      //Modal to get the confession
      const field = new TextInputBuilder()
        .setLabel('Confession')
        .setCustomId('confession')
        .setPlaceholder('Type your confession here')
        .setMinLength(8)
        .setMaxLength(1000)
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph);
      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(field);
      const modal = new ModalBuilder()
        .setCustomId('confession')
        .setTitle('Anonymously Confess')
        .addComponents(row);

      await interaction.showModal(modal);
    },
  },
};

export const ConfessSubmit: Feature = {
  Interaction: {
    name: 'confession',
    moderatorOnly: false,
    async modalSubmit({ interaction, channel, userSf }) {
      await interaction.deferUpdate();

      const confession = interaction.fields.getTextInputValue('confession');
      const formatted = confession
        .split('\n')
        .map(x => `> ${x}`)
        .join('\n');
      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Anonymous' })
        .setDescription(formatted);

      const message = await channel.send({ embeds: [embed] });
      await prisma.confessMessage.create({
        data: { userSf, messageSf: BigInt(message.id) },
      });
      //Delete confessMessage records older than a month
      await prisma.confessMessage.deleteMany({
        where: { at: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } },
      });

      log(`Confession by ${userSf}: ${confession}`);

      await RenewStickyMessage(channel);
    },
  },
};

export const ConfessMute: Feature = {
  async Init(commands) {
    await commands.create({
      type: ApplicationCommandType.Message,
      name: 'Mute confessor',
    });
  },
  Interaction: {
    name: 'Mute confessor',
    moderatorOnly: true,
    async contextMenu({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const messageSf = BigInt(interaction.targetMessage.id);
      const { userSf } =
        (await prisma.confessMessage.findUnique({
          where: { messageSf },
          select: { userSf: true },
        })) ?? {};

      if (!userSf) {
        await interaction.editReply('Invalid confession, or too long ago.');
        return;
      }

      try {
        const { tag } = await client.users.fetch(`${userSf}`);
        const userSf_guildSf = { userSf, guildSf };
        await prisma.member.upsert({
          where: { userSf_guildSf },
          create: { ...userSf_guildSf, tag, confessMute: true },
          update: { confessMute: true },
        });

        const row = DeleteMessageRow(messageSf);

        await interaction.editReply({
          content: 'User muted.',
          components: [row],
        });
      } catch {
        await interaction.editReply(
          'Invalid ID, user has left, or some other error occurred.',
        );
      }
    },
  },
};

export const ConfessUnmute: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'confess-unmute',
      description: 'Unmute a user from using the `/confess` command',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'The user to unmute',
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'confess-unmute',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const { id, tag } = interaction.options.getUser('user', true);

      const userSf = BigInt(id);
      const userSf_guildSf = { userSf, guildSf };
      await prisma.member.upsert({
        where: { userSf_guildSf },
        create: { ...userSf_guildSf, tag, confessMute: false },
        update: { confessMute: false },
      });

      await interaction.editReply('User unmuted, if they were muted.');
    },
  },
};

const RenewStickyMessage = async (channel: TextBasedChannel) => {
  const channelSf = BigInt(channel.id);
  const existingMessageSf = (
    await prisma.channelFlags.findFirst({ where: { channelSf } })
  )?.confessMessage;

  //Check if it's already the latest message
  const mostRecent = await channel.messages.fetch({ limit: 1 });
  if (mostRecent.first()?.id === `${existingMessageSf}`) return;

  const existing = existingMessageSf
    ? await TryFetchMessage(channel, existingMessageSf)
    : null;
  await existing?.delete();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('confess')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🤫'),
  );

  const newMessage = await channel.send({
    content: 'Click the button below to confess anonymously.',
    components: [row],
  });

  const confessMessage = BigInt(newMessage.id);
  await prisma.channelFlags.upsert({
    where: { channelSf },
    update: { confessMessage },
    create: { channelSf, confessMessage },
  });

  setTimeout(async () => {
    await RenewStickyMessage(channel);
  }, 5 * 60_000);
};
