import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';
import { ParseDurationAsMs, RoleIsAboveMe } from '../infrastructure';

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
            'The duration to apply the role for (e.g. "1m 1h 1d 1w 1M 1y")',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'temp-role',
    needPermit: 'Member',
    async command({ interaction, guild, guildSf }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);

      if (RoleIsAboveMe(role.id, guild)) {
        await interaction.editReply(
          'I cannot assign the role because it is above me.',
        );
        return;
      }

      const duration = interaction.options.getString('duration', true);
      const member = guild.members.cache.get(user.id);
      if (!member) {
        await interaction.editReply('User is not in this server');
        return;
      }
      const userSf = BigInt(user.id);
      const roleSf = BigInt(role.id);

      const ms = ParseDurationAsMs(duration);
      if (typeof ms === 'string') {
        await interaction.editReply(ms);
        return;
      }

      try {
        await member.roles.add(role.id);
      } catch (e) {
        await interaction.editReply('Failed to add role');
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
