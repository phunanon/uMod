import { ApplicationCommandOptionType, Guild, Message } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';
import { CheckIfMod } from '..';

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
    async command({ interaction }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const userSf = BigInt(user.id);

      const { pingProtect } =
        (await prisma.userFlags.findUnique({ where: { userSf } })) ?? {};

      const flags = await prisma.userFlags.upsert({
        where: { userSf },
        create: { userSf, pingProtect: true },
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
  async HandleMessage({ message, guild, userSf, isEdit, isMod }) {
    if (!message.mentions.users.size || isEdit || isMod) return;
    const users = message.mentions.users.filter(
      user => !user.bot && user.id !== message.author.id,
    );

    for (const user of users.values()) {
      await handle(guild, message, userSf, BigInt(user.id));
    }
  },
};

async function handle(
  guild: Guild,
  message: Message,
  userSf: bigint,
  aboutSf: bigint,
) {
  const flags = await prisma.userFlags.findUnique({
    where: { userSf: aboutSf },
  });
  if (!flags?.pingProtect) return;

  const userSf_aboutSf = { userSf, aboutSf };
  const warned = await prisma.pingProtectWarns.findUnique({
    where: { userSf_aboutSf },
  });

  if (warned) {
    await message.reply({
      content: `<@${userSf}> was timed-out for pinging <@${aboutSf}>.`,
      allowedMentions: { parse: [] },
    });
    await message.member?.timeout(
      60_000,
      `Pinging protected user (<@${aboutSf}>)`,
    );
  } else {
    await prisma.pingProtectWarns.create({ data: userSf_aboutSf });
    await message.reply({
      content: `<@${aboutSf}> is ping-protected. **If you ping them again you will be timed-out.**`,
      allowedMentions: { parse: [] },
    });
  }
}
