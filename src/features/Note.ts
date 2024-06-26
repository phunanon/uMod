import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { AlertEvent, HandleAlert } from './Alert';

export const Note: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'note',
      description: 'Add a note to a user only other moderators can see',
      options: [
        {
          name: 'user',
          description: 'The user to add the note to',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'note',
          description: 'The note to add',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'note',
    moderatorOnly: true,
    async command({ interaction, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser('user');
      const content = interaction.options.getString('note');
      if (!user || !content) {
        await interaction.editReply('Please provide a user and note');
        return;
      }

      await prisma.note.create({
        data: { guildSf, authorSf: userSf, userSf: BigInt(user.id), content },
      });

      await HandleAlert({
        event: AlertEvent.Note,
        userSf,
        guildSf,
        content: `concerning <@${user.id}>: ${content}`,
      });

      await interaction.editReply(
        `Note added for ${user.username}: ${content}`,
      );
    },
  },
  async HandleAuditLog({ kind, executor, target, reason }, guild) {
    if (!executor || !target) return;
    if (reason.includes("Pinging protected user")) return;
    await prisma.note.create({
      data: {
        guildSf: BigInt(guild.id),
        authorSf: BigInt(executor.id),
        userSf: BigInt(target.id),
        content: `${kind}: ${reason}`,
      },
    });
  },
};

export const ReadNote: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'notes',
      description: 'Read notes for a user',
      options: [
        {
          name: 'user',
          description: 'The user to read notes for',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'notes',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser('user');
      if (!user) {
        await interaction.editReply('Please provide a user');
        return;
      }

      const notes = await prisma.note.findMany({
        where: { guildSf, userSf: BigInt(user.id) },
      });

      if (notes.length === 0) {
        await interaction.editReply('No notes found');
        return;
      }

      const content = notes
        .map(
          note => `- <@${note.authorSf}> ${R(note.notedAt)}: ${note.content}`,
        )
        .join('\n');
      await interaction.editReply(`Notes for ${user.username}:\n${content}`);
    },
  },
};

export const R = (ms: number | Date) =>
  `<t:${Math.floor(new Date(ms).getTime() / 1000)}:R>`;
