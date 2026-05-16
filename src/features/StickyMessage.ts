import { Feature } from '.';
import { ApplicationCommandOptionType } from 'discord.js';
import { client, prisma } from '../infrastructure';
import { Bad } from './AiMod';

export const StickyMessage: Feature = {
  async Init(commands) {
    RenewStickyMessageSoon();
    await commands.create({
      name: 'sticky-message',
      description: 'Create a sticky message in the chat',
      options: [
        {
          name: 'content',
          description: 'Use `\\n` for newlines',
          type: ApplicationCommandOptionType.String,
          required: true,
          maxLength: 2_000,
        },
        {
          name: 'renewal',
          description: 'How many seconds before the message is renewed',
          type: ApplicationCommandOptionType.Integer,
          required: true,
        },
      ],
    });
  },
  async HandleChannelDelete(channel) {
    const channelSf = BigInt(channel.id);
    await prisma.stickyMessage.deleteMany({ where: { channelSf } });
  },
  Interaction: {
    name: 'sticky-message',
    needPermit: 'ChannelConfig',
    async command({ interaction, guildSf, channelSf, channel }) {
      await interaction.reply({
        content: 'Creating sticky message...',
        ephemeral: true,
      });

      const text = interaction.options.get('content', true).value;
      const renewalSeconds = interaction.options.get('renewal', false)?.value;
      if (typeof text !== 'string' || typeof renewalSeconds !== 'number') {
        await interaction.editReply('Invalid content or renewal.');
        return;
      }

      if (await Bad(text)) {
        await interaction.editReply('Content disallowed by AI.');
        return;
      }

      const content = text.replaceAll(/\\n/g, '\n');
      const message = await channel.send({
        content,
        allowedMentions: { parse: [] },
      });
      const sf = BigInt(message.id);
      const renewAt = calcRenewAt(renewalSeconds);

      const data = { guildSf, channelSf, renewAt, content, renewalSeconds, sf };
      await prisma.stickyMessage.create({ data });

      await interaction.editReply('Sticky message created.');
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
    RenewStickyMessageSoon();
  }, 5_000);
};

const RenewStickyMessages = async () => {
  const needsRenewal = await prisma.stickyMessage.findMany({
    where: { renewAt: { lte: new Date() } },
  });

  for (const sticky of needsRenewal) {
    const { guildSf, channelSf, sf, content, renewalSeconds } = sticky;
    const where = { sf_guildSf_channelSf: { sf, guildSf, channelSf } };
    const channel = await (async () => {
      try {
        const guild = await client.guilds.fetch(`${guildSf}`);
        const channel = await guild.channels.fetch(`${channelSf}`);
        if (!channel?.isTextBased()) return;
        return channel;
      } catch (e) {
        console.log('StickyMessage', sticky, e);
      }
    })();
    if (!channel) {
      await prisma.stickyMessage.delete({ where });
      continue;
    }

    const message = await channel.messages.fetch(`${sf}`).catch(() => null);
    const renewAt = calcRenewAt(renewalSeconds);

    if (!message) {
      await prisma.stickyMessage.delete({ where });
      continue;
    }

    //Check if it's already the last message
    const mostRecent = await channel.messages.fetch({ limit: 1 });
    if (mostRecent.first()?.id === message.id) {
      await prisma.stickyMessage.update({ where, data: { renewAt } });
      continue;
    }

    try {
      const newMessage = await channel.send({
        content,
        allowedMentions: { parse: [] },
      });
      await message.delete().catch(console.error);
      const data = { sf: BigInt(newMessage.id), renewAt };
      await prisma.stickyMessage.update({ where, data });
    } catch (e) {
      console.log('StickyMessage', sticky, e);
    }
  }
};

const calcRenewAt = (sec: number) => new Date(Date.now() + sec * 1_000);
