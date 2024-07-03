import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const AutoRole: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'auto-role',
      description: 'Set the role to be assigned to new members',
      options: [
        {
          name: 'role',
          description: 'The role to be assigned to new members',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'auto-role',
    moderatorOnly: true,
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const role = interaction.options.getRole('role', true);
      const guildSf_roleSf = { guildSf, roleSf: BigInt(role.id) };

      const existing = await prisma.autoRole.findUnique({
        where: { guildSf_roleSf },
      });

      if (existing) {
        await prisma.autoRole.delete({ where: { guildSf_roleSf } });
        await interaction.editReply('Auto role removed');
        return;
      }

      await prisma.autoRole.create({ data: { ...guildSf_roleSf } });

      await interaction.editReply(`Auto role set to <@&${role.id}>`);
    },
  },
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const roles = await prisma.autoRole.findMany({ where: { guildSf } });
    const guildRoles = await member.guild.roles.fetch();

    //Check if these roles still exist
    for (const { roleSf } of roles) {
      if (guildRoles.has(`${roleSf}`)) continue;
      const where = { guildSf_roleSf: { guildSf, roleSf } };
      await prisma.autoRole.delete({ where });
    }

    if (roles.length) {
      await member.roles.add(roles.map(({ roleSf }) => `${roleSf}`));
    }
  },
};
