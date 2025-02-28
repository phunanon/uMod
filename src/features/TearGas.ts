import { Feature } from '.';
import { AlertEvent, HandleAlert } from './Alert';

export const TearGas: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'tear-gas',
      description: 'Enable slowmode in this channel for two minutes',
    });
  },
  Interaction: {
    name: 'tear-gas',
    moderatorOnly: true,
    async command({ interaction, guildSf, channel, member }) {
      const ms = 120_000;
      await interaction.reply({
        content: `Ends <t:${Math.floor((Date.now() + ms) / 1000)}:R>`,
        ephemeral: true,
      });
      const content = `**Tear gas deployed!** ☁️`;
      try {
        const restoredLimit = channel.rateLimitPerUser ?? 0;
        await channel.setRateLimitPerUser(120, content);
        setTimeout(() => channel.setRateLimitPerUser(restoredLimit), ms);
        const message = await channel.send(content);
        await HandleAlert({
          guildSf,
          event: AlertEvent.Audit,
          content: `<@${member.id}> threw tear-gas: ${message.url}`,
        });
      } catch (e) {
        await interaction.editReply('Tear-gas failed to deploy');
      }
    },
  },
};
