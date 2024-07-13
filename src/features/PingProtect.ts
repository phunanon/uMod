import { ApplicationCommandOptionType, Message } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const PingProtect: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'ping-protect',
      description:
        'Toggle whether users who ping somebody should be auto-timed-out.',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'The user to protect',
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'ping-protect',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply();

      const { id, tag } = interaction.options.getUser('user', true);
      const userSf = BigInt(id);

      const userSf_guildSf = { userSf, guildSf };
      const { pingProtect } =
        (await prisma.member.findUnique({ where: { userSf_guildSf } })) ?? {};

      const flags = await prisma.member.upsert({
        where: { userSf_guildSf },
        create: { ...userSf_guildSf, tag, pingProtect: true },
        update: { pingProtect: !pingProtect },
      });

      if (!flags.pingProtect) {
        await prisma.pingProtectWarns.deleteMany({
          where: { aboutSf: userSf },
        });
      }

      await interaction.editReply({
        content: `Ping protection is now ${
          flags.pingProtect ? 'enabled' : 'disabled'
        }.`,
      });
    },
  },
  async HandleMessage({ message, guildSf, userSf, isDelete, unmoddable }) {
    if (!message.mentions.users.size || isDelete || unmoddable) return;
    const users = message.mentions.users.filter(
      user => !user.bot && user.id !== message.author.id,
    );

    for (const user of users.values()) {
      await handle(message, guildSf, userSf, BigInt(user.id));
    }
  },
};

async function handle(
  message: Message,
  guildSf: bigint,
  userSf: bigint,
  aboutSf: bigint,
) {
  const flags = await prisma.member.findUnique({
    where: { userSf_guildSf: { userSf: aboutSf, guildSf } },
  });
  if (!flags?.pingProtect) return;

  const userSf_aboutSf = { userSf, aboutSf };
  const warnings = await prisma.pingProtectWarns.findUnique({
    where: { userSf_aboutSf },
  });

  if (warnings) {
    const min = warnings.count + 1;
    const nth = ordinal(min);
    await message.reply({
      content: `<@${userSf}> was timed-out for ${min} minutes for pinging <@${aboutSf}> for the ${nth} time.`,
      allowedMentions: { parse: [] },
    });
    await message.member?.timeout(
      min * 60_000,
      `Pinging protected user (<@${aboutSf}>)`,
    );
    await prisma.pingProtectWarns.update({
      where: { userSf_aboutSf },
      data: { count: { increment: 1 } },
    });
  } else {
    await prisma.pingProtectWarns.create({ data: userSf_aboutSf });
    await message.reply({
      content: `<@${aboutSf}> is ping-protected. **If you ping them again you will be timed-out.**`,
      allowedMentions: { parse: [] },
    });
  }
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? 'th');
}
