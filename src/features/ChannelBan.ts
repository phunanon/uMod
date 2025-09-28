import { ApplicationCommandOptionType } from 'discord.js';
import { ApplicationCommandType } from 'discord.js';
import { Feature } from '.';
import { prisma, quoteContent } from '../infrastructure';
import { MakeNote } from './Note';
import { DeleteMessageRow } from './DeleteMessage';

export const ChannelBan: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'channel-ban',
      description: 'Ban or unban a user from a channel',
      options: [
        {
          name: 'user',
          description: 'The user to un/ban',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'reason',
          description: 'The reason for the un/ban',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'channel-ban',
    needPermit: 'Member',
    async command({ interaction, ...ctx }) {
      const { guildSf, userSf: staffSf, channelSf, channel } = ctx;
      await interaction.deferReply({ ephemeral: true });

      const { options } = interaction;
      const { id } = options.getUser('user', true);
      const reason = options.getString('reason', true);
      const userSf = BigInt(id);

      const existing = await prisma.channelBan.findFirst({
        where: { userSf, channelSf },
      });

      try {
        const permissions = { ViewChannel: !!existing };
        await channel.permissionOverwrites.create(id, permissions);
      } catch (e) {}

      if (existing) {
        await prisma.channelBan.delete({
          where: { channelSf_userSf: { userSf, channelSf } },
        });
        const content = `unbanned from <#${channel.id}>: ${reason}`;
        await MakeNote(guildSf, userSf, staffSf, content);
        await interaction.editReply(
          `User <@${id}> unbanned from <#${channel.id}>.`,
        );
        return;
      }

      await prisma.channelBan.create({ data: { userSf, channelSf } });

      const content = `banned from <#${channel.id}>: ${reason}`;
      await MakeNote(guildSf, userSf, staffSf, content);

      await interaction.editReply(
        `User <@${id}> banned from <#${channel.id}>.`,
      );
    },
  },
  /** Restore channel bans if any are stored */
  async HandleMemberAdd(member) {
    const userSf = BigInt(member.id);
    const channelBans = await prisma.channelBan.findMany({
      select: { channelSf: true },
      where: { userSf },
    });
    const channels = await member.guild.channels.fetch();
    for (const { channelSf } of channelBans) {
      const channel = channels.get(`${channelSf}`);
      console.log('restoring channel ban', userSf, channelSf, channel?.name);
      if (!channel) continue;
      const permissions = { ViewChannel: false };
      await channel.permissionOverwrites.create(member.id, permissions);
    }
  },
};

export const ChannelBanMessage: Feature = {
  async Init(commands) {
    await commands.create({
      type: ApplicationCommandType.Message,
      name: 'Channel ban author',
    });
  },
  Interaction: {
    name: 'Channel ban author',
    needPermit: 'Member',
    async contextMenu({ interaction, channel, guildSf, channelSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const messageSf = BigInt(interaction.targetMessage.id);
      const authorSf = BigInt(interaction.targetMessage.author.id);
      const existing = await prisma.channelBan.findFirst({
        where: { userSf: authorSf, channelSf },
      });

      if (existing) {
        await interaction.editReply(
          'User is already banned from this channel.',
        );
        return;
      }

      try {
        const permissions = { ViewChannel: false };
        await channel.permissionOverwrites.create(`${authorSf}`, permissions);
      } catch (e) {}

      const quotedContent = quoteContent(interaction.targetMessage);
      const content = `banned from channel: ${quotedContent}`;

      await MakeNote(guildSf, authorSf, userSf, content);
      const row = DeleteMessageRow(messageSf);
      await interaction.editReply({
        content: `User <@${authorSf}> banned from <#${channelSf}>.`,
        components: [row],
      });
    },
  },
};
