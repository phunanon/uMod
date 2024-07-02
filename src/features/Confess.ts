import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { client, log, prisma } from '../infrastructure';
import RC5 from 'rc5';

export const Confess: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'confess',
      description: 'Sends an anonymous message in the channel',
      options: [
        {
          name: 'content',
          description: 'The content of the message',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'confess',
    moderatorOnly: false,
    async command({ interaction, channel, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });
      const message = interaction.options.get('content', true).value;

      if (typeof message !== 'string') {
        await interaction.reply('Invalid content.');
        return;
      }

      const { confessMute } =
        (await prisma.member.findUnique({
          where: { userSf_guildSf: { userSf, guildSf } },
          select: { confessMute: true },
        })) ?? {};

      if (confessMute) {
        await interaction.editReply('You are muted from using this command.');
        return;
      }

      await interaction.editReply('Your message should be posted shortly.');

      const id = encryption.encrypt(userSf);
      const content = `${message}\n||\`${id}\`||`;

      await channel.send({ content, allowedMentions: { parse: [] } });

      log(`Confess from ${interaction.user.id}`);
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
