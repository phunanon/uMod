import { ActionRowBuilder, ApplicationCommandOptionType } from 'discord.js';
import { ApplicationCommandType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EmbedBuilder, HexColorString, ModalBuilder } from 'discord.js';
import { TextBasedChannel, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Feature } from '.';
import { client, log, prisma, RecordRealAuthor } from '../infrastructure';
import { TryFetchChannel, TryFetchMessage } from '../infrastructure';
import { DeleteMessageRow } from './DeleteMessage';
import { MakeNote } from './Note';

export const ConfessionsHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'confessions-here',
      description: 'Use this channel for anonymous confessions',
      options: [
        {
          name: 'rules',
          description: 'The rules for confessions here',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
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
    moderatorOnly: true,
    async command({ interaction, channel, channelSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const confessRules = interaction.options.getString('rules');

      const { id, confessMessage } =
        (await prisma.channelFlags.findFirst({
          where: { channelSf, confessMessage: { not: null } },
        })) ?? {};

      if (confessMessage) {
        console.log(`${userSf} disabled confessions for ${channelSf}`);
        await prisma.channelFlags.update({
          where: { id },
          data: { confessMessage: null },
        });
        await interaction.editReply(
          'Confessions for this channel have been disabled.',
        );
        return;
      } else if (confessRules) {
        await prisma.channelFlags.update({
          where: { channelSf },
          data: { confessRules },
        });
      }

      console.log(`${userSf} enabled confessions for ${channelSf}`);

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

const stringToColour = (str: string): HexColorString => {
  const hash = [...str].reduce((a, c) => c.charCodeAt(0) + ((a << 5) - a), 0);
  let colour = '';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    colour += value.toString(16).padStart(2, '0');
  }
  return `#${colour}`;
};

export const ConfessSubmit: Feature = {
  Interaction: {
    name: 'confession',
    moderatorOnly: false,
    async modalSubmit({ interaction, channel, userSf }) {
      await interaction.deferUpdate();

      const confession = interaction.fields
        .getTextInputValue('confession')
        .replace(/#{1,} /g, '');
      const someToken = process.env.DISCORD_TOKEN?.slice(0, 5);
      const embed = new EmbedBuilder()
        .setColor(stringToColour(userSf.toString() + someToken))
        .setFooter({ text: '— Anonymous' })
        .setDescription(confession);

      const message = await channel.send({ embeds: [embed] });
      await RecordRealAuthor(userSf, BigInt(message.id));

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
        (await prisma.realAuthor.findUnique({
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

        const embedContent =
          interaction.targetMessage.embeds[0]?.description ?? '[No content]';
        const noteContent =
          'confession mute:\n> ' + embedContent.split('\n').join('\n> ');
        await MakeNote(
          guildSf,
          userSf,
          BigInt(interaction.user.id),
          noteContent,
        );

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
  const config = await prisma.channelFlags.findFirst({
    where: { channelSf, confessMessage: { not: null } },
  });
  if (!config) return;
  const { confessMessage: existingMessageSf, confessRules } = config;

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
    content:
      'Click the button below to confess anonymously.' +
      (confessRules ? `\n${confessRules}` : ''),
    components: [row],
  });

  const confessMessage = BigInt(newMessage.id);
  await prisma.channelFlags.update({
    where: { channelSf },
    data: { confessMessage },
  });

  setTimeout(async () => {
    await RenewStickyMessage(channel);
  }, 5 * 60_000);
};
