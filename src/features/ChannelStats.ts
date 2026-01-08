import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

const fmt = (n: number) => {
  const num = (n / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 });
  return `${num}k`.padEnd(7, ' ');
};

export const ChannelStats: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'channel-stats',
      description: 'Get stats for all channels',
      options: [
        {
          name: 'public-only',
          description: 'Only show stats for public channels',
          type: ApplicationCommandOptionType.Boolean,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'channel-stats',
    async command({ interaction, guild, guildSf }) {
      await interaction.deferReply();

      const publicOnly = interaction.options.getBoolean('public-only', true);

      const stats = await prisma.channelStat.findMany({
        where: { guildSf, ...(publicOnly ? { isPublic: true } : {}) },
        orderBy: { numMessage: 'desc' },
        take: 20,
      });

      const allChannelSfs = await guild.channels
        .fetch()
        .then(channels => [...channels.keys()].map(channel => BigInt(channel)));
      const deleteStats = stats.filter(
        stat => !allChannelSfs.includes(stat.channelSf),
      );
      await prisma.channelStat.deleteMany({
        where: {
          guildSf,
          channelSf: { in: deleteStats.map(({ channelSf }) => channelSf) },
        },
      });

      const statsMessage = stats.map((s, i) => {
        const name = s.isPublic ? `<#${s.channelSf}>` : `\`${s.name}\``;
        return `${i}. \`${fmt(s.numMessage)}\` ${name}`;
      });
      const earliestAt = Math.min(...stats.map(stat => stat.at.getTime()));
      const t = `<t:${Math.floor(earliestAt / 1000)}:R>`;

      await interaction.editReply(`Since ${t}\n` + statsMessage.join('\n'));
    },
  },
  async HandleMessageCreate({ guild, channel, message, guildSf, channelSf }) {
    if (channel.isDMBased()) return;
    if (message.author.bot) return;

    const { name } = channel;
    const isPublic = channel
      .permissionsFor(guild.roles.everyone)
      .has('ViewChannel');
    const guildSf_channelSf = { guildSf, channelSf };

    await prisma.channelStat.upsert({
      where: { guildSf_channelSf },
      create: { ...guildSf_channelSf, numMessage: 1, isPublic, name },
      update: { numMessage: { increment: 1 }, isPublic, name },
    });
  },
};
