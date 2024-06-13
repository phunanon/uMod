import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const GlobalChat: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'global-chat',
      description: 'Enable/disable global chat for this server in this channel',
      options: [
        {
          name: 'room',
          description:
            'Use /global-chat-list to see existing rooms; prefix with `-` to make private',
          type: ApplicationCommandOptionType.String,
        },
      ],
    });
  },
  async HandleMessage({ message, channelSf, guild, isEdit }) {
    const existing = await prisma.globalChat.findFirst({
      where: { channelSf },
    });

    if (!existing) return;

    const guilds = await prisma.globalChat.findMany({
      where: { NOT: { channelSf }, room: existing.room },
    });

    const member = await guild.members.fetch(message.author.id);
    const nickname =
      member.displayName ?? member.nickname ?? message.author.tag;
    const asterisk = isEdit ? '* ' : '';
    const truncated =
      message.content.length > 1500
        ? `${message.content.slice(0, 1500)}...`
        : message.content;
    const content = `**${nickname}**: ${asterisk}${truncated}`;
    const files = message.attachments.map(a => a.url);

    for (const { channelSf } of guilds) {
      const channel = await (async () => {
        try {
          return await message.client.channels.fetch(`${channelSf}`);
        } catch (e) {
          return null;
        }
      })();
      if (!channel || channel.type !== ChannelType.GuildText) {
        await prisma.globalChat.delete({ where: { channelSf } });
        continue;
      }
      await channel.send({ content, files, allowedMentions: { parse: [] } });
    }
  },
  Interaction: {
    name: 'global-chat',
    moderatorOnly: true,
    async command({ interaction, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const room = interaction.options.getString('chat') ?? 'General';

      const existingChannel = await prisma.globalChat.findFirst({
        where: { channelSf },
      });

      if (existingChannel) {
        await prisma.globalChat.delete({ where: { id: existingChannel.id } });
        await interaction.editReply('Global chat disabled.');
        return;
      }

      await prisma.globalChat.create({ data: { channelSf, room } });

      await interaction.editReply(`Global chat enabled using \`${room}\`.`);
    },
  },
};

export const GlobalChatList: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'global-chat-list',
      description: 'List all global chats available',
    });
  },
  Interaction: {
    name: 'global-chat-list',
    moderatorOnly: false,
    async command({ interaction }) {
      await interaction.deferReply();

      const rooms = await prisma.globalChat.findMany({
        where: { room: { not: { startsWith: '-' } } },
        distinct: ['room'],
      });

      const content = rooms.map(({ room }) => `\`${room}\``).join(', ');

      await interaction.editReply(content || 'No pre-existing global chats.');
    },
  },
};
