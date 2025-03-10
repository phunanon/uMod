import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  GuildMember,
} from 'discord.js';
import { Feature, MsgCtx, TextChannels } from '.';
import {
  client,
  isGoodChannel,
  prisma,
  RecordRealAuthor,
  sanitiseTag,
} from '../infrastructure';
import { DeleteMessageRow } from './DeleteMessage';
import { MakeNote } from './Note';

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
  HandleMessage,
  async HandleBotMessage(ctx) {
    if (ctx.message.author.id === client.user?.id) return;
    await HandleMessage(ctx);
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
      try {
        await msg.react(emoji);
      } catch {}
    }
  },
  Interaction: {
    name: 'global-chat',
    needPermit: 'ChannelConfig',
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

      await prisma.$transaction([
        prisma.globalChat.create({ data: { channelSf, room } }),
        prisma.channelFlags.update({
          where: { channelSf },
          data: { unmoderated: true, antiSpam: true, aiModeration: true },
        }),
      ]);

      await interaction.editReply(
        `Global chat enabled using \`${room}\`. This has also enabled moderation, anti-spam, and AiMod.`,
      );
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

export const GlobalChatMute: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'GlobalChat mute',
      type: ApplicationCommandType.Message,
    });
  },
  Interaction: {
    name: 'GlobalChat mute',
    needPermit: 'EnforceRule',
    async contextMenu({ interaction, guildSf, channelSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const messageSf = BigInt(interaction.targetId);

      const realAuthor = await prisma.realAuthor.findUnique({
        where: { messageSf },
      });

      if (!realAuthor) {
        await interaction.editReply(
          "Couldn't mute; the original author of this message has been forgotten.",
        );
        return;
      }

      const existingMute = await prisma.globalChatMute.findFirst({
        where: { userSf: realAuthor.userSf, channelSf },
      });

      const noteContent =
        `GlobalChat ${existingMute ? 'un' : ''}mute:\n> ` +
        interaction.targetMessage.content.split('\n').join('\n> ');
      await MakeNote(guildSf, realAuthor.userSf, userSf, noteContent);

      if (existingMute) {
        await prisma.globalChatMute.delete({ where: { id: existingMute.id } });
        await interaction.editReply('User unmuted.');
        return;
      }

      await prisma.globalChatMute.create({
        data: { userSf: realAuthor.userSf, channelSf },
      });

      const row = DeleteMessageRow(messageSf);
      await interaction.editReply({
        content: 'User muted.',
        components: [row],
      });
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
        if (
          e &&
          typeof e === 'object' &&
          'rawError' in e &&
          e.rawError &&
          typeof e.rawError === 'object' &&
          'message' in e.rawError
        ) {
          if (e.rawError.message === 'Unknown Channel') {
            await prisma.globalChat.delete({ where: { channelSf } });
          }
        }
        return null;
      }
    })();
    if (!channel) continue;
    if (isGoodChannel(channel)) {
      chatsWithChannel.push({ ...chat, channelSf, channel });
    } else {
      await prisma.globalChat.delete({ where: { channelSf } });
    }
  }

  return chatsWithChannel;
};

async function HandleMessage(
  ctx: Omit<MsgCtx, 'member'> & { member?: GuildMember },
) {
  const { message, channelSf, userSf, isEdit, isDelete, member } = ctx;
  const chats = await GetChatsForChannel(channelSf);
  if (!chats) return;

  const associations = m2m.find(m =>
    m.some(({ messageId }) => messageId === message.id),
  );
  const mutes = await prisma.globalChatMute.findMany({ where: { userSf } });

  const nickname =
    member?.displayName ?? member?.nickname ?? message.author.username;
  const nonemptyContent =
    message.content || message.embeds[0]?.description || '[No content]';
  const truncated =
    nonemptyContent.length > 1500
      ? `${nonemptyContent.slice(0, 1500)}...`
      : nonemptyContent;
  const content = `**${sanitiseTag(nickname)}**: ${truncated}`;
  const files = message.attachments.map(a => a.url);
  const payload = { content, files, allowedMentions: { parse: [] } };

  const mids: (typeof m2m)[0] = [
    { channelId: message.channel.id, messageId: message.id },
  ];
  const msgIds: string[] = [];
  for (const { channel } of chats) {
    if (isEdit || isDelete) {
      for (const { messageId } of associations ?? []) {
        if (messageId === message.id) continue;
        try {
          if (isDelete) {
            await channel.messages.delete(messageId);
          } else {
            await channel.messages.edit(messageId, payload);
          }
        } catch (e) {}
      }
      continue;
    }

    if (mutes.some(m => m.channelSf === BigInt(channel.id))) continue;

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
    const nonce = `${BigInt(message.id) + BigInt(channel.id)}`;
    const enforcedNonce = { nonce, enforceNonce: true };
    const msg = await channel.send({ ...payload, ...enforcedNonce, reply });
    msgIds.push(msg.id);
    mids.push({ channelId: channel.id, messageId: msg.id });
  }

  await RecordRealAuthor(userSf, ...msgIds.map(BigInt));

  if (m2m.length === bufferLen) {
    m2m[m2mIndex] = mids;
    m2mIndex = (m2mIndex + 1) % bufferLen;
  } else {
    m2m.push(mids);
  }
}
