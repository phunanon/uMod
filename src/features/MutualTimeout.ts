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
    async command({ interaction, guild, member, userSf }) {
      await interaction.deferReply();

      try {
        const user = interaction.options.getUser('user', true);
        const targetMember = await guild.members.fetch(user.id);

        if (member.id === targetMember.id) {
          await interaction.editReply("You can't timeout yourself.");
          return;
        }
        if (isTimed(member)) {
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
        await member.timeout(3_600_000, `/mutual-timeout penalty`);

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
