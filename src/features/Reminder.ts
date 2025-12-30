import { Feature } from '.';
import { ApplicationCommandOptionType } from 'discord.js';
import { client, prisma, R } from '../infrastructure';
import { isGoodChannel, ParseDurationAsMs } from '../infrastructure';
import { CensorText } from './Censor';

export const Reminder: Feature = {
  async Init(commands) {
    TickSoon();
    await commands.create({
      name: 'reminder',
      description: 'Ping yourself with a message in the future',
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'when',
          description: 'When to send the reminder (e.g. "1m 1h 1d 1w 1M 1y")',
          required: true,
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'text',
          description: 'What the reminder should say',
          required: true,
          maxLength: 256,
        },
      ],
    });
  },
  Interaction: {
    name: 'reminder',
    async command({ interaction, guildSf, channelSf, userSf }) {
      const duration = interaction.options.getString('when', true);
      const ms = ParseDurationAsMs(duration);
      if (typeof ms === 'string') {
        await interaction.reply(ms);
        return;
      }
      const remindAt = new Date(Date.now() + ms);
      const text = interaction.options.getString('text', true);

      await interaction.deferReply();

      await prisma.reminder.create({
        data: { guildSf, channelSf, userSf, remindAt, text },
      });

      const { censored } = await CensorText(guildSf, text);
      await interaction.editReply(
        `Reminding you ${R(remindAt)} (approximately):\n> ${censored}`,
      );
    },
  },
};

function TickSoon() {
  setTimeout(async () => {
    await tick();
    TickSoon();
  }, 30_000);
}

async function tick() {
  const reminders = await prisma.reminder.findMany({
    where: { remindAt: { lte: new Date() } },
  });

  for (const { id, at, guildSf, channelSf, userSf, text } of reminders) {
    try {
      const channel = await client.channels.fetch(`${channelSf}`);
      if (isGoodChannel(channel)) {
        const { censored } = await CensorText(guildSf, text);
        const title = `You asked me to remind you ${R(at)}`;
        await channel?.send({
          content: `<@${userSf}>`,
          embeds: [{ title, description: censored, color: 0x2f6f7f }],
          allowedMentions: { users: [userSf.toString()] },
        });
      }
    } catch {}
    await prisma.reminder.delete({ where: { id } });
  }
}
