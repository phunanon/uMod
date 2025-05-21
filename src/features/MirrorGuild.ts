import { client, isGoodChannel, prisma, sanitiseTag } from '../infrastructure';
import { Feature, MsgCtx } from '.';

export const MirrorGuild: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'mirror-guild',
      description: 'Mirror all server messages into the current channel',
    });
  },
  HandleMessage,
  async HandleReactionAdd(reaction, user) {
    const { guildId } = reaction.message;
    const { tag } = user;
    if (user.bot || !guildId || !tag) return;
    const channel = await GetMirrorChannel(BigInt(guildId));
    if (!channel || channel.id === reaction.message.channel.id) return;
    const message = await reaction.message.fetch();
    const sanitisedTag = sanitiseTag(tag);
    const emoji = reaction.emoji.toString();
    const content = `**${sanitisedTag}** reacted to ${message.url}: ${emoji} ||${user.id}||`;
    const nonce = `${
      BigInt(message.id) + BigInt(reaction.emoji.id ?? 0) + BigInt(user.id)
    }`;
    await channel.send({ content, nonce, enforceNonce: true });
  },
  async HandleChannelDelete(channel) {
    const channelSf = BigInt(channel.id);
    await prisma.guildMirror.deleteMany({ where: { channelSf } });
  },
  Interaction: {
    name: 'mirror-guild',
    needPermit: 'ChannelConfig',
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

async function HandleMessage({ message, guildSf, isEdit }: MsgCtx) {
  const author = message.author;
  if (!author) return;

  const channel = await GetMirrorChannel(guildSf);
  if (!channel || channel.id === message.channel.id) return;

  const tag = sanitiseTag(author.tag);
  const content = (isEdit ? '*' : '') + (message.content || '[No content]');
  const truncated =
    content.length > 1000 ? content.slice(0, 1000) + '...' : content;

  await channel.send({
    content: `**${tag}** ${message.url} ||${author.id}||\n${truncated}`,
    files: isEdit ? undefined : message.attachments.map(a => a.url),
    allowedMentions: { parse: [] },
    nonce: message.id,
    enforceNonce: true,
  });
}

async function GetMirrorChannel(guildSf: bigint) {
  const mirror = await prisma.guildMirror.findFirst({ where: { guildSf } });
  if (!mirror) return null;
  const channel = await client.channels.fetch(`${mirror.channelSf}`);
  if (!isGoodChannel(channel)) return null;
  return channel;
}
