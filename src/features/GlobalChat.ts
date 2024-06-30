import { ApplicationCommandOptionType } from 'discord.js';
import { Feature, TextChannels } from '.';
import { client, isGoodChannel, prisma, sanitiseTag } from '../infrastructure';

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
  async HandleMessage({ message, channelSf, isEdit, isDelete, member }) {
    const chats = await GetChatsForChannel(channelSf);
    if (!chats) return;

    const associations = m2m.find(m =>
      m.some(({ messageId }) => messageId === message.id),
    );

    const nickname =
      member.displayName ?? member.nickname ?? message.author.tag;
    const truncated =
      message.content.length > 1500
        ? `${message.content.slice(0, 1500)}...`
        : message.content;
    const content = `**${sanitiseTag(nickname)}**: ${truncated}`;
    const files = message.attachments.map(a => a.url);
    const payload = { content, files, allowedMentions: { parse: [] } };

    const mids: (typeof m2m)[0] = [
      { channelId: message.channel.id, messageId: message.id },
    ];
    for (const { channel } of chats) {
      if (isEdit || isDelete) {
        for (const { messageId } of associations ?? []) {
          if (messageId === message.id) continue;
          try {
            await channel.messages.edit(
              messageId,
              isEdit
                ? payload
                : { content: `**${nickname}**: [deleted]`, files: [] },
            );
          } catch (e) {}
        }
        continue;
      }

      const reply = await (async () => {
        const msgId = message.reference?.messageId;
        if (!msgId) return;
        const association = m2m
          .find(m => m.some(({ messageId }) => messageId === msgId))
          ?.find(({ channelId }) => channelId === channel.id);
        const messageReference = association
          ? await channel.messages.fetch(association.messageId)
          : null;
        return messageReference ? { messageReference } : undefined;
      })();
      const msg = await channel.send({ ...payload, reply });
      mids.push({ channelId: channel.id, messageId: msg.id });
    }

    if (m2m.length === bufferLen) {
      m2m[m2mIndex] = mids;
      m2mIndex = (m2mIndex + 1) % bufferLen;
    } else {
      m2m.push(mids);
    }
  },
  async HandleTypingStart(typing) {
    if (typing.user.id === client.user?.id) return;
    const chats = await GetChatsForChannel(BigInt(typing.channel.id));
    for (const { channel } of chats ?? []) {
      await channel.sendTyping();
    }
  },
  async HandleReactionAdd({ message, emoji }, user) {
    if (user.id === client.user?.id) return;

    const associations = m2m.find(m =>
      m.some(({ messageId }) => messageId === message.id),
    );
    if (!associations) return;

    for (const { channelId, messageId } of associations) {
      if (messageId === message.id) continue;
      const channel = await client.channels.fetch(channelId);
      if (!isGoodChannel(channel)) continue;
      const msg = await channel.messages.fetch(messageId);
      await msg.react(emoji);
    }
  },
  Interaction: {
    name: 'global-chat',
    moderatorOnly: true,
    async command({ interaction, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const room = interaction.options.getString('room') ?? 'General';

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

const GetChatsForChannel = async (channelSf: bigint) => {
  const thisChat = await prisma.globalChat.findMany({
    where: { channelSf },
  });

  if (!thisChat.length) return;

  const chats = await prisma.globalChat.findMany({
    where: { NOT: { channelSf }, room: { in: thisChat.map(c => c.room) } },
  });

  const chatsWithChannel: ((typeof chats)[0] & { channel: TextChannels })[] =
    [];
  for (const { channelSf, ...chat } of chats) {
    const channel = await (async () => {
      try {
        return await client.channels.fetch(`${channelSf}`);
      } catch (e) {
        return null;
      }
    })();
    if (!isGoodChannel(channel)) {
      //TODO: The channel no longer exists, is of the incorrect type, or was just a transient error?
      //await prisma.globalChat.delete({ where: { channelSf } });
      continue;
    }
    chatsWithChannel.push({ ...chat, channelSf, channel });
  }

  return chatsWithChannel;
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
