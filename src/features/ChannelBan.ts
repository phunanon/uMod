import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { HandleAlert } from './Alert';

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
      ],
    });
  },
  Interaction: {
    commandName: 'channel-ban',
    moderatorOnly: true,
    async handler({ interaction, guildSf, userSf, channel }) {
      await interaction.deferReply();

      const { options } = interaction;
      const user = options.getUser('user');

      if (!user) {
        await interaction.editReply('Invalid user.');
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

      const content = `User <@${user.id}> banned from <#${channel.id}>.`;
      await HandleAlert({
        event: 'audit',
        userSf,
        guildSf,
        content: `concerning <@${user.id}>: ${content}`,
      });

      await interaction.editReply(
        `User <@${user.id}> banned from <#${channel.id}>.`,
      );
    },
  },
};
