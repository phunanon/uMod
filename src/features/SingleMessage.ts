import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextBasedChannel,
} from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const SingleMessage: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'single-message',
      description: 'Allow each user to send only one message in this channel',
    });
  },
  Interaction: {
    name: 'single-message',
    moderatorOnly: true,
    async command({ interaction, channel, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const { id, singleMessage } =
        (await prisma.channelFlags.findFirst({
          where: { channelSf, singleMessage: { not: null } },
        })) ?? {};

      if (singleMessage) {
        await prisma.channelFlags.update({
          where: { id },
          data: { singleMessage: null },
        });
        await interaction.editReply(
          'Single message restriction has been removed.',
        );
        return;
      }

      await SendStickyMessage(channel);

      await interaction.editReply(
        'Single message restriction has been enabled.',
      );
    },
  },
  async HandleMessage(ctx) {
    const { message, channel, channelSf, userSf, isEdit, isDelete } = ctx;
    if (isEdit) return;

    const where = { channelSf, singleMessage: { not: null } };
    const { singleMessage } =
      (await prisma.channelFlags.findFirst({ where })) ?? {};
    if (!singleMessage) return;

    if (isDelete) {
      await channel.permissionOverwrites.edit(`${userSf}`, {
        SendMessages: true,
      });
      return;
    }

    const { author } = message;

    await channel.permissionOverwrites.edit(author.id, { SendMessages: false });

    await SendStickyMessage(channel, singleMessage);
  },
};

const SendStickyMessage = async (
  channel: TextBasedChannel,
  existingMessageSf?: bigint,
) => {
  const existing = existingMessageSf
    ? await (async () => {
        try {
          return await channel.messages.fetch(`${existingMessageSf}`);
        } catch (e) {}
      })()
    : null;
  await existing?.delete();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('delete_single')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
  );

  const newMessage = await channel.send({
    content: `Already sent a message? Click the button below to delete it and send a new one.`,
    components: [row],
  });

  const channelSf = BigInt(channel.id);
  const singleMessage = BigInt(newMessage.id);
  await prisma.channelFlags.upsert({
    where: { channelSf },
    update: { singleMessage },
    create: { channelSf, singleMessage },
  });
};

export const DeleteSingleMessage: Feature = {
  Interaction: {
    name: 'delete_single',
    moderatorOnly: false,
    async button({ interaction, channelSf, channel }) {
      await interaction.deferReply({ ephemeral: true });

      const where = { channelSf, singleMessage: { not: null } };
      const { singleMessage } =
        (await prisma.channelFlags.findFirst({ where })) ?? {};
      if (!singleMessage) {
        await interaction.editReply('Feature not supported in this channel.');
        return;
      }

      try {
        const messages = (await channel.messages.fetch()).find(
          x => x.author.id === interaction.user.id,
        );
        await messages?.delete();
      } catch (e) {}

      await channel.permissionOverwrites.edit(interaction.user.id, {
        SendMessages: true,
      });

      await interaction.editReply(
        'If you had one, your old message has been deleted. You can now send a new one.',
      );
    },
  },
};
