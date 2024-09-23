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
    });
  },
  Interaction: {
    name: 'channel-stats',
    moderatorOnly: false,
    async command({ interaction, guild, guildSf }) {
      await interaction.deferReply();

      const stats = await prisma.channelStat.findMany({
        where: { guildSf },
        orderBy: { numMessage: 'desc' },
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

      const statsMessage = stats.map(stat => {
        return `\`${fmt(stat.numMessage)}\` <#${stat.channelSf}>`;
      });
      const earliestAt = Math.min(...stats.map(stat => stat.at.getTime()));
      const t = `<t:${Math.floor(earliestAt / 1000)}:R>`;

      await interaction.editReply(`Since ${t}\n` + statsMessage.join('\n'));
    },
  },
  async HandleMessageCreate({ guild, channel, guildSf, channelSf }) {
    if (!channel.permissionsFor(guild.roles.everyone).has('ViewChannel'))
      return;

    const guildSf_channelSf = { guildSf, channelSf };
    await prisma.channelStat.upsert({
      where: { guildSf_channelSf },
      create: { ...guildSf_channelSf, numMessage: 1 },
      update: { numMessage: { increment: 1 } },
    });
  },
};
