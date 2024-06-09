import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';

export const MutualTimeout: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'mutual-timeout',
      description:
        'Timeout someone for five minutes, but simultaneously timeout yourself for ten minutes.',
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

        await targetMember.timeout(300_000, `/mutual-timeout by <@${userSf}>.`);
        await userMember.timeout(600_000, `/mutual-timeout penalty`);

        await interaction.editReply(
          `<@${userSf}> timed out <@${user.id}> for five minutes, in return for a ten minute timeout :saluting_face:`,
        );
      } catch (e) {
        await interaction.editReply(
          'An error occurred while trying to timeout the user.',
        );
      }
    },
  },
};
