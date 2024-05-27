import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { ChannelFlags } from '@prisma/client';

export const WhitelistChannel: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'whitelist-channel',
      description: 'Disable moderation for current channel',
      options: [
        {
          name: 'type',
          description: 'The type of moderation to disable',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            {
              name: 'All (no mirroring, censoring, gif blocking, etc)',
              value: 'unmoderated',
            },
            { name: 'Censoring', value: 'censoring' },
          ],
        },
      ],
    });
  },
  Interaction: {
    name: 'whitelist-channel',
    moderatorOnly: true,
    async command({ interaction, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const type = interaction.options.getString('type');
      if (!type) {
        await interaction.editReply('Invalid type.');
        return;
      }

      const flags = await prisma.channelFlags.findFirst({
        where: { channelSf },
      });

      const upsert = async (update: Partial<ChannelFlags>) => {
        await prisma.channelFlags.upsert({
          where: { channelSf },
          update,
          create: { channelSf, ...update },
        });
      };

      if (type === 'unmoderated') {
        const unmoderated = !flags?.unmoderated;
        await upsert({ unmoderated });
        await interaction.editReply(
          unmoderated ? 'Channel now unmoderated.' : 'Channel now moderated.',
        );
        return;
      }

      if (type === 'censoring') {
        const censor = !(flags?.censor ?? true);
        await upsert({ censor });
        await interaction.editReply(
          censor ? 'Censoring now enabled.' : 'Censoring now disabled.',
        );
        return;
      }

      await interaction.editReply('Invalid type.');
    },
  },
};
