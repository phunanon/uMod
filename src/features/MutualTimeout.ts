import { ApplicationCommandOptionType, GuildMember } from 'discord.js';
import { Feature } from '.';

export const MutualTimeout: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'mutual-timeout',
      description:
        'Timeout someone for five minutes, but simultaneously timeout yourself for one hour.',
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          description: 'The user to mute.',
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'mutual-timeout',
    moderatorOnly: false,
    async command({ interaction, userSf, guild }) {
      await interaction.deferReply();

      try {
        const user = interaction.options.getUser('user', true);
        const userMember = await guild.members.fetch(`${userSf}`);
        const targetMember = await guild.members.fetch(user.id);

        if (userMember.id === targetMember.id) {
          await interaction.editReply("You can't timeout yourself.");
          return;
        }
        if (isTimed(userMember)) {
          await interaction.editReply(
            "You're already timed out. You can't timeout someone else until your timeout is over.",
          );
          return;
        }
        if (isTimed(targetMember)) {
          await interaction.editReply(
            "The user you're trying to timeout is already timed out.",
          );
          return;
        }

        await targetMember.timeout(300_000, `/mutual-timeout by <@${userSf}>.`);
        await userMember.timeout(3_600_000, `/mutual-timeout penalty`);

        await interaction.editReply(
          `<@${userSf}> timed out <@${user.id}> for five minutes, in return for a one hour timeout :saluting_face:`,
        );
      } catch (e) {
        await interaction.editReply(
          'An error occurred while trying to timeout the user.',
        );
      }
    },
  },
};

const isTimed = ({ communicationDisabledUntil }: GuildMember) =>
  communicationDisabledUntil && communicationDisabledUntil > new Date();
