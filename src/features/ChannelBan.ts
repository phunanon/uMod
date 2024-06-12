import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { AlertEvent, HandleAlert } from './Alert';
import { prisma } from '../infrastructure';

export const ChannelBan: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'channel-ban',
      description: 'Ban a user from a channel',
      options: [
        {
          name: 'user',
          description: 'The user to ban',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'reason',
          description: 'The reason for the ban',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'channel-ban',
    moderatorOnly: true,
    async command({ interaction, guildSf, userSf, channelSf, channel, guild }) {
      await interaction.deferReply({ ephemeral: true });

      const { options } = interaction;
      const user = options.getUser('user');
      const reason = options.getString('reason');

      if (!user || !reason) {
        await interaction.editReply('Invalid user or reason.');
        return;
      }

      const member = await guild.members.fetch(user.id);
      if (!member) {
        await interaction.editReply('User not found.');
        return;
      }

      await channel.permissionOverwrites.create(user.id, {
        ViewChannel: false,
      });

      await prisma.channelBan.create({ data: { guildSf, userSf, channelSf } });

      const content = `banned from <#${channel.id}>: ${reason}`;
      await HandleAlert({
        event: AlertEvent.Audit,
        userSf,
        guildSf,
        content: `concerning <@${user.id}>: ${content}`,
      });
      await prisma.note.create({
        data: { guildSf, authorSf: userSf, userSf: BigInt(user.id), content },
      });

      await interaction.editReply(
        `User <@${user.id}> banned from <#${channel.id}>.`,
      );
    },
  },
  /** Restore channel bans if any are stored */
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const channelBans = await prisma.channelBan.findMany({
      select: { channelSf: true },
      where: { guildSf, userSf },
    });
    const channels = await member.guild.channels.fetch();
    for (const { channelSf } of channelBans) {
      const channel = channels.get(`${channelSf}`);
      if (!channel) continue;
      await channel.permissionOverwrites.create(member.id, {
        ViewChannel: false,
      });
    }
  },
};
