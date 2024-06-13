import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

const bufferLen = 10_000;
const m2m: { channelId: string; messageId: string }[][] = [];
let m2mIndex = 0;

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
    const truncated =
      message.content.length > 1500
        ? `${message.content.slice(0, 1500)}...`
        : message.content;
    const content = `**${nickname}**: ${truncated}`;
    const files = message.attachments.map(a => a.url);
    const payload = { content, files, allowedMentions: { parse: [] } };

    const mids: (typeof m2m)[0] = [
      { channelId: message.channel.id, messageId: message.id },
    ];
    const associations = m2m.find(m =>
      m.some(({ messageId }) => messageId === message.id),
    );
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

      if (isEdit) {
        if (associations) {
          for (const { messageId } of associations) {
            if (messageId === message.id) continue;
            try {
              await channel.messages
                .fetch(messageId)
                .then(msg => msg.edit(payload));
            } catch (e) {}
          }
          continue;
        }
      } else {
        const msg = await channel.send(payload);
        mids.push({ channelId: channel.id, messageId: msg.id });
      }
    }

    if (m2m.length === bufferLen) {
      m2m[m2mIndex] = mids;
      m2mIndex = (m2mIndex + 1) % bufferLen;
    } else {
      m2m.push(mids);
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
