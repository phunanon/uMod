import { ChannelType } from 'discord.js';
import { Feature, InteractionGuard, MessageGuard } from '.';
import { prisma } from '../infrastructure';

export const GlobalChat: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'global-chat',
      description: 'Enable global chat for this server in this channel.',
    });
  },
  async HandleMessageCreate(message) {
    const { guildSf, channelSf } = (await MessageGuard(message)) ?? {};
    if (!guildSf || !channelSf) return;

    const existing = await prisma.globalChat.findFirst({ where: { guildSf } });

    if (!existing || existing.channelSf !== channelSf) return;

    const guilds = await prisma.globalChat.findMany({
      where: { NOT: { guildSf } },
    });

    for (const { channelSf } of guilds) {
      const channel = await message.client.channels.fetch(`${channelSf}`);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await prisma.globalChat.delete({ where: { guildSf, channelSf } });
        continue;
      }
      const guild = await message.client.guilds.fetch(`${guildSf}`);
      const member = await guild.members.fetch(message.author.id);
      const nickname =
        member.displayName ?? member.nickname ?? message.author.tag;
      const content = `**${nickname}**: ${message.content}`;
      const files = message.attachments.map(a => a.url);
      await channel.send({ content, files });
    }
  },
  async HandleInteractionCreate(interaction) {
    const { chatInteraction, guildSf, channelSf } =
      (await InteractionGuard(interaction, 'global-chat', true)) ?? {};
    if (!chatInteraction || !guildSf || !channelSf) return;

    await chatInteraction.deferReply();

    const existing = await prisma.globalChat.findFirst({
      where: { guildSf, channelSf },
    });

    if (existing) {
      await prisma.globalChat.delete({ where: { id: existing.id } });
      await chatInteraction.editReply('Global chat disabled.');
      return;
    }

    await prisma.globalChat.create({ data: { guildSf, channelSf } });

    await chatInteraction.editReply('Global chat enabled.');
  },
};
