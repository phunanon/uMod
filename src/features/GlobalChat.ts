import { ChannelType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const GlobalChat: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'global-chat',
      description: 'Enable global chat for this server in this channel.',
    });
  },
  async HandleMessage({ message, guildSf, channelSf, isEdit }) {
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
      const asterisk = isEdit ? '* ' : '';
      const content = `**${nickname}**: ${asterisk}${message.content}`;
      const files = message.attachments.map(a => a.url);
      await channel.send({ content, files, allowedMentions: { parse: [] } });
    }
  },
  Interaction: {
    commandName: 'global-chat',
    moderatorOnly: true,
    async handler({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();

      const existing = await prisma.globalChat.findFirst({
        where: { guildSf, channelSf },
      });

      if (existing) {
        await prisma.globalChat.delete({ where: { id: existing.id } });
        await interaction.editReply('Global chat disabled.');
        return;
      }

      await prisma.globalChat.create({ data: { guildSf, channelSf } });

      await interaction.editReply('Global chat enabled.');
    },
  },
};
