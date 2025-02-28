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
            { name: 'Anti-spam', value: 'antispam' },
            { name: 'Censoring', value: 'censoring' },
          ],
        },
      ],
    });
  },
  Interaction: {
    name: 'whitelist-channel',
    moderatorOnly: true,
    async command({ interaction, channelFlags, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const type = interaction.options.getString('type', true);

      const globalChatOn = !!(await prisma.globalChat.findUnique({
        where: { channelSf },
      }));

      const upsert = async (data: Partial<ChannelFlags>) => {
        await prisma.channelFlags.update({ where: { channelSf }, data });
      };
      const cannotDisable = async (what: string) => {
        if (!globalChatOn) return false;
        await interaction.editReply(
          `GlobalChat is enabled in this channel; cannot disable ${what}.`,
        );
        return true;
      };

      if (type === 'unmoderated') {
        const unmoderated = !channelFlags?.unmoderated;
        if (unmoderated && (await cannotDisable('moderation'))) return;
        await upsert({ unmoderated });
        await interaction.editReply(
          unmoderated ? 'Channel now unmoderated.' : 'Channel now moderated.',
        );
        return;
      }

      if (type === 'censoring') {
        const censor = !(channelFlags?.censor ?? true);
        await upsert({ censor });
        await interaction.editReply(
          censor ? 'Censoring now enabled.' : 'Censoring now disabled.',
        );
        return;
      }

      if (type === 'antispam') {
        const antiSpam = !(channelFlags?.antiSpam ?? true);
        if (!antiSpam && (await cannotDisable('anti-spam'))) return;
        await upsert({ antiSpam });
        await interaction.editReply(
          antiSpam ? 'Anti-spam now enabled.' : 'Anti-spam now disabled.',
        );
        return;
      }

      await interaction.editReply('Invalid type.');
    },
  },
  async HandleChannelDelete(channel) {
    const channelSf = BigInt(channel.id);
    await prisma.channelFlags.deleteMany({ where: { channelSf } });
  },
};
