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
    commandName: 'channel-ban',
    moderatorOnly: true,
    async handler({ interaction, guildSf, userSf, channel }) {
      await interaction.deferReply({ ephemeral: true });

      const { options } = interaction;
      const user = options.getUser('user');
      const reason = options.getString('reason');

      if (!user || !reason) {
        await interaction.editReply('Invalid user or reason.');
        return;
      }

      const guild = interaction.guild;

      if (!guild) {
        await interaction.editReply('Guild not found, for some reason.');
        return;
      }

      const member = await guild.members.fetch(user.id);
      if (!member) {
        await interaction.editReply('User not found.');
        return;
      }

      await channel.permissionOverwrites.create(user.id, {
        SendMessages: false,
        AddReactions: false,
      });

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
};
