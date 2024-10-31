import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { MakeNote } from './Note';

export const ChannelBan: Feature = {
  ModCommands: [
    {
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
    },
  ],
  Interaction: {
    name: 'channel-ban',
    moderatorOnly: true,
    async command({ interaction, ...ctx }) {
      const { guildSf, userSf: authorSf, channelSf, channel } = ctx;
      await interaction.deferReply({ ephemeral: true });

      const { options } = interaction;
      const { id } = options.getUser('user', true);
      const reason = options.getString('reason', true);
      const userSf = BigInt(id);

      const existing = await prisma.channelBan.findFirst({
        where: { userSf, channelSf },
      });

      try {
        await channel.permissionOverwrites.create(id, {
          ViewChannel: !!existing,
        });
      } catch (e) {}

      if (existing) {
        await prisma.channelBan.delete({
          where: { channelSf_userSf: { userSf, channelSf } },
        });
        const content = `unbanned from <#${channel.id}>: ${reason}`;
        await MakeNote(guildSf, userSf, authorSf, content);
        await interaction.editReply(
          `User <@${id}> unbanned from <#${channel.id}>.`,
        );
        return;
      }

      await prisma.channelBan.create({ data: { userSf, channelSf } });

      const content = `banned from <#${channel.id}>: ${reason}`;
      await MakeNote(guildSf, userSf, authorSf, content);

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
      await channel.permissionOverwrites.create(member.id, {
        ViewChannel: false,
      });
    }
  },
};
