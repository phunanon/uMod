import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const Histogram: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'histogram',
      description: 'Generate a histogram of server or user activity',
      options: [
        {
          name: 'kind',
          description: 'The kind of histogram to generate',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'Daily', value: 'daily' },
            { name: 'Hourly', value: 'hourly' },
          ],
          required: true,
        },
        {
          name: 'user',
          description: 'The user to generate a histogram for',
          type: ApplicationCommandOptionType.User,
        },
      ],
    });
  },
  Interaction: {
    name: 'histogram',
    moderatorOnly: false,
    async command({ interaction, guildSf, guild }) {
      await interaction.deferReply();

      const kind = interaction.options.getString('kind') ?? 'daily';
      const user = interaction.options.getUser('user');
      const sf = user ? BigInt(user.id) : guildSf;
      const histogram = await prisma.histogram.findMany({ where: { sf } });
      const earliestSince = histogram.reduce((acc, { since }) => {
        if (since < acc) return since;
        return acc;
      }, new Date());
      const days = Math.ceil(
        (Date.now() - earliestSince.getTime()) / (1000 * 60 * 60 * 24),
      );
      const text = `Over the past ${days} day` + (days === 1 ? '' : 's');

      const embed =
        kind === 'daily' ? dayHistogram(histogram) : hourHistogram(histogram);
      await interaction.editReply({
        content: `Histogram for ${user ? `<@${user.id}>` : guild.name}`,
        embeds: [{ ...embed, footer: { text } }],
      });
    },
  },
  async HandleMessageCreate({ guildSf, userSf }) {
    const weekDay = (new Date().getUTCDay() + 6) % 7;
    const dayHour = new Date().getUTCHours();
    await prisma.$transaction([
      prisma.histogram.upsert({
        where: { sf_weekDay_dayHour: { sf: guildSf, weekDay, dayHour } },
        update: { count: { increment: 1 } },
        create: { sf: guildSf, weekDay, dayHour, count: 1 },
      }),
      prisma.histogram.upsert({
        where: { sf_weekDay_dayHour: { sf: userSf, weekDay, dayHour } },
        update: { count: { increment: 1 } },
        create: { sf: userSf, weekDay, dayHour, count: 1 },
      }),
    ]);
  },
};

type Count = { weekDay: number; dayHour: number; count: number };
const w = 12;

function dayHistogram(counts: Count[]) {
  const dayCounts = counts.reduce((acc, { weekDay, count }) => {
    acc[weekDay] ??= 0;
    acc[weekDay] += count;
    return acc;
  }, {} as Record<number, number>);
  const days = Array.from({ length: 7 }, (_, i) => dayCounts[i] ?? 0);
  const dayMax = Math.max(...days);
  const d = (day: number) =>
    '`' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day] + '` ';
  const daygram = days.map(
    (count, day) => d(day) + '█'.repeat(Math.round((count / dayMax) * w)),
  );
  return {
    title: 'Daily Activity (starts <t:0:t> for you)',
    description: daygram.join('\n'),
  };
}

function hourHistogram(counts: Count[]) {
  const dayHour = new Date().getUTCHours();
  const hourCounts = counts.reduce((acc, { dayHour, count }) => {
    acc[dayHour] ??= 0;
    acc[dayHour] += count;
    return acc;
  }, {} as Record<number, number>);
  const hours = Array.from({ length: 24 }, (_, i) => hourCounts[i] ?? 0);
  const hourMax = Math.max(...hours);
  const h = (hour: number) => {
    const isNow = hour === dayHour;
    const text = `<t:${hour * 3600}:t>`;
    return isNow ? `__${text}__` : `${text}`;
  };
  const hourgram = hours.map(
    (count, hour) => h(hour) + '█'.repeat(Math.round((count / hourMax) * w)),
  );
  return { title: 'Hourly Activity', description: hourgram.join('\n') };
}
