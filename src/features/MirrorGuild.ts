import { ChannelType } from 'discord.js';
import { client, prisma } from '../infrastructure';
import { Feature, InteractionGuard, IsChannelWhitelisted } from '.';

export const MirrorGuild: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'mirror-guild',
      description: 'Mirror all server messages into the current channel.',
    });
  },
  async HandleMessageCreate(message) {
    if (await IsChannelWhitelisted(message.channel.id)) return;
    if (message.channel.type !== ChannelType.GuildText) return;
    const guildId = message.guild?.id;
    if (!guildId) return;

    const mirror = await prisma.guildMirror.findFirst({
      where: { guildSf: BigInt(guildId) },
    });

    if (!mirror) return;

    const channel = await client.channels.fetch(`${mirror.channelSf}`);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    if (channel.id === message.channel.id) return;

    const author = message.author;
    if (!author) return;

    const content = message.content ?? '[No content]';

    await channel.send({
      content: `${message.url}\n${author.id} **${author.tag}**: ${content}`,
      files: message.attachments.map(a => a.url),
    });
  },
  async HandleInteractionCreate(interaction) {
    const { guildSf, channelSf, chatInteraction } =
      (await InteractionGuard(interaction, 'mirror-guild', true)) ?? {};
    if (!guildSf || !channelSf || !chatInteraction) return;

    const existing = await prisma.guildMirror.findFirst({ where: { guildSf } });

    if (existing) {
      await prisma.guildMirror.delete({ where: { id: existing.id } });
      await chatInteraction.reply('Mirror channel disabled.');
      return;
    }

    await prisma.guildMirror.create({ data: { guildSf, channelSf } });

    await chatInteraction.reply('Mirror channel enabled.');
  },
};
