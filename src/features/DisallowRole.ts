import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { MakeNote } from './Note';

export const DisallowRole: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'disallow-role',
      description:
        'Disallow (or re-allow) a certain user being assigned a certain role',
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          description: 'The user to disallow (or re-allow) the role from',
          required: true,
        },
        {
          type: ApplicationCommandOptionType.Role,
          name: 'role',
          description: 'The role to disallow (or re-allow)',
          required: true,
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'reason',
          description: 'The reason for disallowing (or re-allowing) the role',
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
    needPermit: 'Member',
    async command({ interaction, guild, guildSf, userSf: authorSf }) {
      await interaction.deferReply();

      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const reason = interaction.options.getString('reason', true);
      const userSf = BigInt(user.id);
      const roleSf = BigInt(role.id);
      const userSf_roleSf = { userSf, roleSf };
      const where = { where: { userSf_roleSf } };
      const allowedMentions = { parse: [] };

      const existing = await prisma.disallowRole.findUnique(where);
      const dis = existing ? '' : 'dis';
      const content = `<@&${role.id}> now ${dis}allowed for <@${user.id}>: ${reason}`;

      if (existing) {
        await prisma.disallowRole.delete(where);
        await interaction.editReply({ content, allowedMentions });
      } else {
        await prisma.disallowRole.create({ data: userSf_roleSf });
        try {
          const member = await guild.members.fetch(user.id);
          await member.roles.remove(`${roleSf}`);
          await interaction.editReply({ content, allowedMentions });
        } catch (e) {
          await interaction.editReply(
            "Failed to remove role from user (perhaps they didn't have it or left the server) but they are still disallowed from gaining the role.",
          );
        }
      }
      await MakeNote(guildSf, userSf, authorSf, content);
    },
  },
};
