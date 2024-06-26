import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';

export const TempRole: Feature = {
  async Init(commands) {
    setTimeout(check, 1000);

    await commands.create({
      name: 'temp-role',
      description: 'Give a user a role for a certain amount of time',
      options: [
        {
          name: 'user',
          description: 'The user to apply the role to',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'role',
          description: 'The role to apply to the user',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
        {
          name: 'duration',
          description:
            'The duration to apply the role for (e.g. "1h 1d 1w 1M")',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'temp-role',
    moderatorOnly: true,
    async command({ interaction, guild, guildSf }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const duration = interaction.options.getString('duration', true);
      const member = guild.members.cache.get(user.id);
      if (!member) {
        await interaction.editReply('User is not in this server');
        return;
      }
      const userSf = BigInt(user.id);
      const roleSf = BigInt(role.id);

      // Parse the duration
      const time = duration.match(/(\d+)([mhdwMy])/g);
      if (!time) {
        await interaction.editReply('Invalid duration');
        return;
      }

      try {
        await member.roles.add(role.id);
      } catch (e) {
        await interaction.editReply('Failed to add role');
        return;
      }

      const mss: Record<string, number> = {
        m: 60_000,
        h: 60 * 60_000,
        d: 24 * 60 * 60_000,
        w: 7 * 24 * 60 * 60_000,
        M: 30 * 24 * 60 * 60_000,
        y: 365 * 24 * 60 * 60_000,
      };
      const ms = time.reduce(
        (acc, t) => acc + parseInt(t.slice(0, -1)) * (mss[t.slice(-1)] ?? 1),
        0,
      );

      if (!ms) {
        await interaction.editReply(
          'Invalid duration (0) - should be e.g. "1m 2h 3d 4w 5M 6y"',
        );
        return;
      }

      const expires = new Date(Date.now() + ms);
      await prisma.tempRole.create({
        data: { guildSf, userSf, roleSf, expires },
      });

      const t = `<t:${Math.floor(expires.getTime() / 1000)}:f>`;
      await interaction.editReply(
        `<@&${role.id}> added for <@${userSf}> until ${t}`,
      );
    },
  },
};

async function check() {
  const tempRoles = await prisma.tempRole.findMany({
    where: { expires: { lte: new Date() } },
  });

  for (const { id, guildSf, userSf, roleSf } of tempRoles) {
    try {
      const guild = await client.guilds.fetch(`${guildSf}`);
      const member = await guild.members.fetch(`${userSf}`);
      const role = await guild.roles.fetch(`${roleSf}`);
      role && member.roles.remove(role);
    } catch (e) {}
    await prisma.tempRole.delete({ where: { id } });
  }

  setTimeout(check, 10_000);
}
