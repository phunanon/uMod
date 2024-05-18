import { Feature } from '.';
import { ApplicationCommandOptionType, TextBasedChannel } from 'discord.js';
import { client, prisma } from '../infrastructure';

export const StickyMessage: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'sticky-message',
      description: 'Create a sticky message in the chat',
      options: [
        {
          name: 'content',
          description: 'The content of the sticky message',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'renewal',
          description: 'How many seconds before the message is renewed',
          type: ApplicationCommandOptionType.Integer,
          required: true,
        },
      ],
    });
    RenewStickyMessageSoon();
  },
  Interaction: {
    commandName: 'sticky-message',
    moderatorOnly: true,
    async handler({ interaction, guildSf, channelSf, channel }) {
      await interaction.reply('Creating sticky message...');

      const content = interaction.options.get('content', true).value;
      const renewalSeconds = interaction.options.get('renewal', false)?.value;
      if (typeof content !== 'string' || typeof renewalSeconds !== 'number') {
        await interaction.editReply('Invalid content or renewal.');
        return;
      }

      const message = await channel.send(content);
      const sf = BigInt(message.id);
      const renewAt = calcRenewAt(renewalSeconds);

      const data = { guildSf, channelSf, renewAt, content, renewalSeconds, sf };
      await prisma.stickyMessage.create({ data });

      await interaction.editReply('Sticky message created or updated.');
    },
  },
};

const RenewStickyMessageSoon = () => {
  setTimeout(async () => {
    try {
      await RenewStickyMessages();
    } catch (e) {
      console.error(e);
    }
  }, 5_000);
};

const RenewStickyMessages = async () => {
  const needsRenewal = await prisma.stickyMessage.findMany({
    where: { renewAt: { lte: new Date() } },
  });

  for (const sticky of needsRenewal) {
    const { guildSf, channelSf, sf, content, renewalSeconds } = sticky;
    const where = { sf_guildSf_channelSf: { sf, guildSf, channelSf } };
    const guild = await client.guilds.fetch(`${guildSf}`);
    const channel = await guild.channels.fetch(`${channelSf}`);
    if (!channel?.isTextBased()) return;

    const message = await TryFetchMessage(channel, sf);
    const renewAt = calcRenewAt(renewalSeconds);

    if (!message) {
      await prisma.stickyMessage.delete({ where });
      return;
    }

    //Check if it's already the last message
    const mostRecent = await channel.messages.fetch({ limit: 1 });
    if (mostRecent.first()?.id === message.id) {
      await prisma.stickyMessage.update({ where, data: { renewAt } });
      return;
    }

    try {
      await message.delete();
      const newMessage = await channel.send(content);
      const data = { sf: BigInt(newMessage.id), renewAt };
      await prisma.stickyMessage.update({ where, data });
    } catch (e) {
      console.log('StickyMessage', sticky, e);
    }
  }

  RenewStickyMessageSoon();
};

const calcRenewAt = (sec: number) => new Date(Date.now() + sec * 1_000);

const TryFetchMessage = async (channel: TextBasedChannel, sf: bigint) => {
  try {
    return await channel.messages.fetch(`${sf}`);
  } catch {
    return null;
  }
};
