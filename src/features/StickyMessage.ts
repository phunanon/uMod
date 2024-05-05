import { Feature, InteractionGuard } from '.';
import { ApplicationCommandOptionType, TextBasedChannel } from 'discord.js';
import { client, prisma } from '../infrastructure';

export const StickyMessage: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'sticky-message',
      description: 'Create a sticky message in the chat.',
      options: [
        {
          name: 'content',
          description: 'The content of the sticky message.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'renewal',
          description: 'How many seconds before the message is renewed.',
          type: ApplicationCommandOptionType.Integer,
          required: true,
        },
      ],
    });
    setInterval(async () => {
      await RenewStickyMessages();
    }, 5_000);
  },
  async HandleInteractionCreate(interaction) {
    const { guildSf, channelSf, channel, chatInteraction } =
      (await InteractionGuard(interaction, 'sticky-message', true)) ?? {};
    if (!guildSf || !channelSf || !channel || !chatInteraction) return;
    const guildSf_channelSf = { guildSf, channelSf };

    const content = chatInteraction.options.get('content', true).value;
    const renewalSeconds = chatInteraction.options.get('renewal', false)?.value;
    if (typeof content !== 'string' || typeof renewalSeconds !== 'number') {
      await chatInteraction.reply('Invalid content or renewal.');
      return;
    }

    const message = await channel.send(content);
    const sf = BigInt(message.id);
    const renewAt = calcRenewAt(renewalSeconds);

    await prisma.stickyMessage.upsert({
      where: { guildSf_channelSf },
      update: { content, renewAt },
      create: { ...guildSf_channelSf, renewAt, content, renewalSeconds, sf },
    });

    await chatInteraction.reply('Sticky message created or updated.');
  },
};

const RenewStickyMessages = async () => {
  const needsRenewal = await prisma.stickyMessage.findMany({
    where: { renewAt: { lte: new Date() } },
  });

  for (const sticky of needsRenewal) {
    const { guildSf, channelSf, sf, content, renewalSeconds } = sticky;
    const guildSf_channelSf = { guildSf, channelSf };
    const guild = await client.guilds.fetch(`${guildSf}`);
    const channel = await guild.channels.fetch(`${channelSf}`);
    if (!channel?.isTextBased()) return;

    const message = await TryFetchMessage(channel, sf);
    const renewAt = calcRenewAt(renewalSeconds);

    if (!message) {
      await prisma.stickyMessage.delete({ where: { guildSf_channelSf } });
      return;
    }

    //Check if it's already the last message
    const mostRecent = await channel.messages.fetch({ limit: 1 });
    if (mostRecent.first()?.id === message.id) {
      await prisma.stickyMessage.update({
        where: { guildSf_channelSf },
        data: { renewAt },
      });
      return;
    }

    await message.delete();
    const newMessage = await channel.send(content);
    await prisma.stickyMessage.update({
      where: { guildSf_channelSf },
      data: { sf: BigInt(newMessage.id), renewAt },
    });
  }
};

const calcRenewAt = (sec: number) => new Date(Date.now() + sec * 1_000);

const TryFetchMessage = async (channel: TextBasedChannel, sf: bigint) => {
  try {
    return await channel.messages.fetch(`${sf}`);
  } catch {
    return null;
  }
};
