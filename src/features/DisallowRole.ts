import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const DisallowRole: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'disallow-role',
      description: 'Disallow a certain user being assigned a certain role',
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          description: 'The user to disallow the role from',
          required: true,
        },
        {
          type: ApplicationCommandOptionType.Role,
          name: 'role',
          description: 'The role to disallow',
          required: true,
        },
      ],
    });
  },
  async HandleMemberUpdate(_, { id, roles }) {
    const userSf = BigInt(id);
    const roleSf = roles.cache.map(r => BigInt(r.id));
    const userSf_roleSfs = roleSf.map(roleSf => ({ userSf, roleSf }));
    for (const userSf_roleSf of userSf_roleSfs) {
      const existing = await prisma.disallowRole.findUnique({
        where: { userSf_roleSf },
      });
      if (existing) {
        await roles.remove(`${existing.roleSf}`);
      }
    }
  },
  Interaction: {
    name: 'disallow-role',
    moderatorOnly: true,
    async command({ interaction, guild, guildSf, userSf: authorSf }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const userSf = BigInt(user.id);
      const roleSf = BigInt(role.id);
      const userSf_roleSf = { userSf, roleSf };
      const allowedMentions = { parse: [] };

      const existing = await prisma.disallowRole.findUnique({
        where: { userSf_roleSf },
      });
      const dis = existing ? '' : 'dis';
      const content = `<@&${role.id}> now ${dis}allowed for <@${user.id}>.`;
      const data = { guildSf, authorSf, userSf, content };

      if (existing) {
        await prisma.disallowRole.delete({ where: { userSf_roleSf } });
      } else {
        try {
          const member = await guild.members.fetch(user.id);
          await member.roles.remove(`${roleSf}`);
          await prisma.disallowRole.create({ data: userSf_roleSf });
        } catch (e) {
          await interaction.editReply('Failed to remove role from user.');
          return;
        }
      }
      await interaction.editReply({ content, allowedMentions });
      await prisma.note.create({ data });
    },
  },
};
