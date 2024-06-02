import { ChannelType } from 'discord.js';
import { client, prisma } from '../infrastructure';
import { Feature, MessageContext } from '.';

export const MirrorGuild: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'mirror-guild',
      description: 'Mirror all server messages into the current channel',
    });
  },
  HandleMessage,
  async HandleChannelDelete(channel) {
    const channelSf = BigInt(channel.id);
    await prisma.guildMirror.deleteMany({ where: { channelSf } });
  },
  Interaction: {
    name: 'mirror-guild',
    moderatorOnly: true,
    async command({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();

      const where = { guildSf };
      const existing = await prisma.guildMirror.findFirst({ where });

      if (existing) {
        await prisma.guildMirror.delete({ where: { id: existing.id } });
        await interaction.editReply('Mirror channel disabled.');
        return;
      }

      await prisma.guildMirror.create({ data: { guildSf, channelSf } });

      await interaction.editReply('Mirror channel enabled.');
    },
  },
};

async function HandleMessage({ message, guildSf }: MessageContext) {
  const mirror = await prisma.guildMirror.findFirst({ where: { guildSf } });

  if (!mirror) return;

  const channel = await client.channels.fetch(`${mirror.channelSf}`);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  if (channel.id === message.channel.id) return;

  const author = message.author;
  if (!author) return;

  const content = message.content || '[No content]';
  const truncated =
    content.length > 1000 ? content.slice(0, 1000) + '...' : content;

  await channel.send({
    content: `**${author.tag}** ${message.url} ||${author.id}||\n${truncated}`,
    files: message.attachments.map(a => a.url),
    allowedMentions: { parse: [] },
  });
}
