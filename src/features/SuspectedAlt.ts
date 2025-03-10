import { Feature } from '.';
import { MakeNote } from './Note';
import { ApplicationCommandOptionType } from 'discord.js';

export const SuspectedAlt: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'suspected-alt',
      description: 'Make note of two users being suspected as the same person',
      options: [
        {
          name: 'user-a',
          description: 'User A',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'user-b',
          description: 'User B',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'note',
          description: 'Notes that detail your suspicion',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'suspected-alt',
    needPermit: 'EnforceRule',
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const { id: A } = interaction.options.getUser('user-a', true);
      const { id: B } = interaction.options.getUser('user-b', true);
      const ASF = BigInt(A);
      const BSF = BigInt(B);

      const note = interaction.options.getString('note', true);
      await MakeNote(guildSf, ASF, userSf, `<@${BSF}> alt suspicion: ${note}`);
      await MakeNote(guildSf, BSF, userSf, `<@${ASF}> alt suspicion: ${note}`);

      await interaction.editReply({
        content: `<@${ASF}> and <@${BSF}> alt suspicion noted.`,
        allowedMentions: { parse: [] },
      });
    },
  },
};
