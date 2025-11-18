import { Feature } from '.';
import { client, prisma } from '../infrastructure';
import { MakeNote } from './Note';
import { Message } from 'discord.js';

export const IngestNotes: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'ingest-notes',
      description: 'Use this channel to ingest notes about users',
    });
  },
  Interaction: {
    name: 'ingest-notes',
    needPermit: 'ChannelConfig',
    async command({ interaction, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const existing = await prisma.channelFlags.findUnique({
        where: { channelSf },
      });
      const ingestNotes = !existing?.ingestNotes;

      await prisma.channelFlags.upsert({
        where: { channelSf },
        create: { channelSf, ingestNotes },
        update: { ingestNotes },
      });

      await interaction.editReply(
        ingestNotes
          ? `You can now create notes by simply writing messages in this channel like so:
<@${client.user?.id}> This is a note about the user, which will be attributed to the sender of the message.`
          : 'Ingesting notes is now disabled for this channel.',
      );
    },
  },
  async HandleMessageCreate({ guildSf, channelFlags, message }) {
    if (!channelFlags.ingestNotes) return;
    await HandleMessage(guildSf, message);
  },
  async HandleBotMessageCreate({ guildSf, channelFlags, message }) {
    if (!channelFlags.ingestNotes) return;
    await HandleMessage(guildSf, message);
  },
};

async function HandleMessage(guildSf: bigint, message: Message) {
  const authorSf = BigInt(message.author.id);
  const aboutSf = message.content.match(/^<@(\d+?)>/)?.[1];
  const aboutSfBigInt = aboutSf ? BigInt(aboutSf) : null;

  if (!aboutSfBigInt) return;

  const noteContent = message.content.replace(/^<@(\d+?)>\s*/, '');
  if (!noteContent) return;

  await MakeNote(guildSf, aboutSfBigInt, authorSf, noteContent);

  await message.react('✅');
}
