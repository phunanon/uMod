import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';

export const KickWithDm: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'kick-with-dm',
      description: 'Send a DM just before kicking a user',
      options: [
        {
          name: 'user',
          description: 'The user to DM then kick',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'reason',
          description: 'The reason for the kick, sent to the user',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'kick-with-dm',
    needPermit: 'Member',
    async command({ interaction, guild }) {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        await interaction.editReply(`Unable to find <@${user.id}>`);
        return;
      }

      try {
        const dm = await user.createDM();
        await dm.send({
          embeds: [
            {
              title: 'You have been kicked by staff',
              description: `You have been kicked from the server **${guild.name}**, for the following reason:
> ${reason}`,
              footer: {
                text: 'If you resolve the issue then you may return to the server.',
              },
            },
          ],
        });
      } catch {
        await interaction.editReply(
          `Unable to DM <@${user.id}>, and so they weren't kicked either`,
        );
        return;
      }

      try {
        await member.kick(`by <@${interaction.user.id}>: (DM'd) ${reason}`);
      } catch {
        await interaction.editReply(
          `Unable to kick <@${user.id}>, but they were DM'd.`,
        );
        return;
      }

      await interaction.editReply(`DM'd and then kicked <@${user.id}>.`);
    },
  },
};
