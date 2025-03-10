import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const FakeUser: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'fake-user',
      description: 'Mimic a user',
      options: [
        {
          name: 'user',
          description: 'User to mimic',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'fake-user',
    async command({ interaction }) {
      await interaction.deferReply();

      const { id, displayName } = interaction.options.getUser('user', true);
      const sf = BigInt(id);

      await interaction.editReply({
        content: `**${displayName}**: ${await mimic(sf)}`,
        allowedMentions: { parse: [] },
      });

      //Forget pairs from longer than a month ago
      await prisma.pairFrequency.deleteMany({
        where: {
          userSf: sf,
          at: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
    },
  },
  async HandleMessageCreate({ message, userSf, channelFlags }) {
    if (message.content.length < 10) return;
    if (channelFlags.unmoderated) return;
    //Break message into every combination of two words in a row
    const words = `[start] ${message.content} [end]`.toLowerCase().split(/\s+/);
    const pairs = words
      .slice(0, -1)
      .map((_, i) => words.slice(i, i + 2) as [string, string]);

    const existingFreqs = await prisma.pairFrequency.findMany({
      where: {
        userSf,
        OR: pairs.map(([a, b]) => ({ a, b })),
      },
      select: { a: true, b: true },
    });
    const novelFreqs = pairs.filter(
      ([x, y]) => !existingFreqs.some(({ a, b }) => a === x && b === y),
    );
    try {
      //This sometimes fails due to unique constraints not being met
      await prisma.pairFrequency.createMany({
        data: novelFreqs.map(([a, b]) => ({ userSf, a, b })),
      });
    } catch (e) {
      return;
    }

    //Update the counts of the existing frequencies
    await prisma.pairFrequency.updateMany({
      where: {
        userSf,
        OR: existingFreqs.map(({ a, b }) => ({ a, b })),
      },
      data: { count: { increment: 1 } },
    });
  },
};

async function mimic(userSf: bigint) {
  const frequencies = await prisma.pairFrequency.findMany({
    where: { userSf },
    orderBy: { count: 'desc' },
  });

  const starts = frequencies.filter(({ a }) => a === '[start]');
  const randomStart = starts[Math.floor(Math.random() * starts.length)];
  let current = randomStart;
  if (!current) {
    return "[I don't know enough about that user to mimic them yet]";
  }
  const sentence: string[] = [];
  let allowedStalls = 3;
  //Stitch together the most common fragments
  while (current && sentence.length < 64 && allowedStalls) {
    //process.stdout.write(current.a + ' ' + current.b + '  ');
    let { a, b } = current;
    if (b === '[end]') {
      --allowedStalls;
      b = a;
    } else {
      sentence.push(b);
    }
    const nextIdx = frequencies.findIndex(({ a }) => a === b);
    current = nextIdx === -1 ? undefined : frequencies[nextIdx];
    frequencies.splice(nextIdx, 1);
  }

  return sentence.join(' ').replaceAll(/\bi\b/g, 'I');
}
