import { ApplicationCommandOptionType } from 'discord.js';
import { ApplicationCommandType } from 'discord.js';
import { Feature } from '.';
import { prisma, quoteContent, R, userOption } from '../infrastructure';
import { AlertEvent, HandleAlert } from './Alert';
import { Note as DbNote } from '@prisma/client';
import { DeleteMessageRow } from './DeleteMessage';

export const MakeNote = async (
  guildSf: bigint,
  userSf: bigint,
  authorSf: bigint,
  content: string,
) => {
  await prisma.note.create({
    data: { guildSf, authorSf, userSf, content },
  });
  await HandleAlert({
    event: AlertEvent.Note,
    userSf: authorSf,
    guildSf,
    content: `concerning <@${userSf}>: ${content}`,
  });
};

export const Note: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'note',
      description: 'Add a note to a user only other moderators can see',
      options: [
        userOption('The user to add the note to', true),
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
    needPermit: 'EnforceRule',
    async command({ interaction, guildSf, userSf: authorSf }) {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser('user', true);
      const content = interaction.options.getString('note', true);
      const userSf = BigInt(user.id);

      await MakeNote(guildSf, userSf, authorSf, content);

      await interaction.editReply(
        `Note added for ${user.username}: ${content}`,
      );
    },
  },
  async HandleAuditLog({ kind, executor, target, reason }, guild) {
    if (!executor || !target) return;
    await prisma.note.create({
      data: {
        guildSf: BigInt(guild.id),
        authorSf: BigInt(executor.id),
        userSf: BigInt(target.id),
        content: reason ? `${kind}: ${reason}` : kind,
      },
    });
  },
};

export const printNotes = (notes: DbNote[], key?: 'authorSf' | 'userSf') => {
  const mostRecent = notes.slice(-12);
  const list = mostRecent.map(note => {
    const taggedUser = key ? `<@${note[key]}> ` : '';
    return `- ${taggedUser}${R(note.notedAt)}: ${note.content}`.trim();
  });
  while (list.join('\n').length > 1_750 && list.length) list.shift();
  const numEarlier = notes.length - list.length;
  const warn =
    list.length !== notes.length
      ? `\n${numEarlier.toLocaleString()} earlier notes not shown`
      : '';
  return `${list.join('\n')}${warn}`;
};

export const ReadNotes: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'notes',
      description: 'Read notes for a user',
      options: [userOption('The user to read notes for', true)],
    });
  },
  Interaction: {
    name: 'notes',
    needPermit: 'EnforceRule',
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

      await interaction.editReply(
        `Notes for ${user.username}:\n${printNotes(notes, 'authorSf')}`,
      );
    },
  },
};

export const ReadNotesButton: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'notes',
      description: 'Read notes for a user',
      options: [userOption('The user to read notes for', true)],
    });
  },
  Interaction: {
    name: 'read-notes-*',
    needPermit: 'EnforceRule',
    async button({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.customId.split('-')[2];

      if (!userId) {
        await interaction.editReply('There is an issue with this button.');
        return;
      }

      const notes = await prisma.note.findMany({
        where: { guildSf, userSf: BigInt(userId) },
      });

      if (notes.length === 0) {
        await interaction.editReply('No notes found');
        return;
      }

      await interaction.editReply(
        `Notes for <@${userId}>:\n${printNotes(notes, 'authorSf')}`,
      );
    },
  },
};

export const ReadNotesByAuthor: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'notes-by-author',
      description: 'Read notes by a specific author (usually staff)',
      options: [
        {
          name: 'author',
          description: 'The author of the notes to read',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'notes-by-author',
    needPermit: 'EnforceRule',
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const author = interaction.options.getUser('author', true);

      const notes = await prisma.note.findMany({
        where: { guildSf, authorSf: BigInt(author.id) },
      });

      if (notes.length === 0) {
        await interaction.editReply('No notes found');
        return;
      }

      await interaction.editReply(
        `Notes by \`${author.username}\`:\n${printNotes(notes, 'userSf')}`,
      );
    },
  },
};

export const ContextNote: Feature = {
  async Init(commands) {
    await commands.create({
      type: ApplicationCommandType.Message,
      name: 'Note this message',
    });
  },
  Interaction: {
    name: 'Note this message',
    needPermit: 'EnforceRule',
    async contextMenu({ interaction, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const aboutSf = BigInt(interaction.targetMessage.author.id);
      const note = '\n' + quoteContent(interaction.targetMessage);
      await MakeNote(guildSf, aboutSf, userSf, note);

      const row = DeleteMessageRow(BigInt(interaction.targetMessage.id));
      await interaction.editReply({
        content: 'Note added successfully',
        components: [row],
      });
    },
  },
};
