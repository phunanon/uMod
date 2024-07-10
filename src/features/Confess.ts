import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Feature } from '.';
import { client, log, prisma } from '../infrastructure';
import RC5 from 'rc5';

export const ConfessionsHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'confessions-here',
      description: 'Use this channel for anonymous confessions',
    });
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
    async modalSubmit({ interaction, channel, channelSf, userSf }) {
      await interaction.deferUpdate();

      const confession = interaction.fields.getTextInputValue('confession');
      const id = encryption.encrypt(userSf);
      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Anonymous' })
        .setDescription(confession)
        .setFooter({ text: id });

      await channel.send({ embeds: [embed] });
      log(`Confession by ${userSf}: ${confession}`);

      await RenewStickyMessage(channel);
    },
  },
};

export const ConfessMute: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'confess-mute',
      description: 'Mute a user from using the `/confess` command',
      options: [
        {
          name: 'id',
          description: 'The confess message ID',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'confess-mute',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const id = interaction.options.get('id')?.value;
      if (typeof id !== 'string') {
        await interaction.reply('Invalid ID.');
        return;
      }

      try {
        const userSf = encryption.decrypt(id);
        const { tag } = await client.users.fetch(`${userSf}`);
        const userSf_guildSf = { userSf, guildSf };
        await prisma.member.upsert({
          where: { userSf_guildSf },
          create: { ...userSf_guildSf, tag, confessMute: true },
          update: { confessMute: true },
        });

        await interaction.editReply('User muted.');
      } catch (e) {
        await interaction.editReply(
          'Invalid ID, user has left, or some other error occurred.',
        );
      }
    },
  },
};

const encryption = {
  key() {
    const token = process.env.DISCORD_TOKEN ?? '';
    return token.slice(0, 8);
  },
  encrypt(userSf: bigint) {
    const rc5 = new RC5(this.key());
    const plain = Buffer.from(userSf.toString(16).padStart(16, '0'), 'hex');
    const encrypted = rc5.encrypt(plain);
    return encrypted.toString('base64');
  },
  decrypt(encrypted: string): bigint {
    const rc5 = new RC5(this.key());
    const decrypted = rc5
      .decrypt(Buffer.from(encrypted, 'base64'))
      .toString('hex');
    return BigInt(`0x${decrypted}`);
  },
};

const RenewStickyMessage = async (channel: TextBasedChannel) => {
  const channelSf = BigInt(channel.id);
  const existingMessageSf = (
    await prisma.channelFlags.findFirst({ where: { channelSf } })
  )?.confessMessage;
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
};
