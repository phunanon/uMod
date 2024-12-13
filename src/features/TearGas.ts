import { Feature } from '.';
import { AlertEvent, HandleAlert } from './Alert';

export const TearGas: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'tear-gas',
      description: 'Enable slowmode in this channel for one minute',
    });
  },
  Interaction: {
    name: 'tear-gas',
    moderatorOnly: true,
    async command({ interaction, guildSf, channel, member }) {
      await interaction.deferReply();
      const content = `Tear gas deployed! ☁️`;
      try {
        const restoredLimit = channel.rateLimitPerUser ?? 0;
        await channel.setRateLimitPerUser(60, content);
        setTimeout(() => channel.setRateLimitPerUser(restoredLimit), 60_000);
        const message = await interaction.editReply({
          content,
          allowedMentions: { parse: [] },
        });
        await HandleAlert({
          guildSf,
          event: AlertEvent.Audit,
          content: `<@${member.id}> threw tear-gas ${message.url}`,
        });
      } catch (e) {
        await interaction.editReply('Tear-gas failed to deploy');
      }
    },
  },
};
