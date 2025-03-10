import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const GifMute: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'gif-mute',
      description: 'Prevent a member from sending GIFs',
      options: [
        {
          name: 'user',
          description: 'The user to mute',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'gif-mute',
    needPermit: 'Member',
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const { tag } = interaction.options.getUser('user') ?? {};
      if (!tag) {
        await interaction.editReply('Invalid user.');
        return;
      }

      const userSf_guildSf = { userSf, guildSf };
      const where = { where: { userSf_guildSf } };

      const existing = await prisma.member.findUnique(where);

      if (existing?.gifMute) {
        await prisma.member.update({ ...where, data: { gifMute: false } });
        await interaction.editReply(`Unmuted ${tag} from sending GIFs.`);
        return;
      }

      await prisma.member.upsert({
        ...where,
        create: { ...userSf_guildSf, tag, gifMute: true },
        update: { gifMute: true },
      });

      await interaction.editReply(`Muted ${tag} from sending GIFs.`);
    },
  },
  async HandleMessage({ message, guildSf, userSf }) {
    const member = await prisma.member.findUnique({
      where: { userSf_guildSf: { userSf, guildSf } },
    });

    const hasGif = message.attachments.some(a => a.url.endsWith('.gif'));
    if (member?.gifMute && hasGif) {
      await message.delete();
    }
  },
};
