import { ApplicationCommandOptionType, GuildMember } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { AutoRole as DbAutoRole } from '@prisma/client';

export const AutoRole: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'auto-role',
      description: 'Configure roles to be assigned to new members',
      options: [
        {
          name: 'role',
          description: 'Assigned to new (and optionally all) members',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
        {
          name: 'retroactive',
          description: 'Assign or remove the role for all existing members',
          type: ApplicationCommandOptionType.Boolean,
          required: true,
        },
        {
          name: 'every-nth-id',
          description:
            'If specified, 1 is every odd ID, 2 every even, 3 every third, etc.',
          type: ApplicationCommandOptionType.Integer,
          minValue: 1,
          required: false,
        },
      ],
    });
  },
  Interaction: {
    name: 'auto-role',
    needPermit: 'ServerConfig',
    async command({ interaction, guild, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const role = interaction.options.getRole('role', true);
      const retroactive = interaction.options.getBoolean('retroactive', true);
      const everyNth = interaction.options.getInteger('every-nth-id', false);
      const guildSf_roleSf = { guildSf, roleSf: BigInt(role.id) };

      const existing = await prisma.autoRole.findUnique({
        where: { guildSf_roleSf },
      });

      const [past, progressive, autoRole] = await (async () => {
        if (existing) {
          await prisma.autoRole.delete({ where: { guildSf_roleSf } });
          return ['removed', 'removing', existing] as const;
        } else {
          const autoRole = await prisma.autoRole.create({
            data: { ...guildSf_roleSf, everyNth },
          });
          return ['added', 'adding', autoRole] as const;
        }
      })();

      const reteroactivity = await (async () => {
        if (!retroactive || !autoRole) return '';
        const addOrRemove = existing ? 'remove' : 'add';
        const allMembers = await guild.members.fetch();
        const predicate = (x: GuildMember) => Applies(x, addOrRemove)(autoRole);
        const members = [...allMembers.values()].filter(predicate);
        for (const member of members) {
          setTimeout(async () => {
            await MemberRoles(member, [autoRole], existing ? 'remove' : 'add');
          }, 1_000);
        }
        const t = Math.floor(Date.now() / 1_000) + members.length;
        return `Retroactively ${progressive} for all members now - estimated to finish <t:${t}:R>.`;
      })();
      await interaction.editReply(
        `Auto role ${past}: <@&${role.id}>. ${reteroactivity}`,
      );
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

    await MemberRoles(member, roles.filter(Applies(member, 'add')), 'add');
  },
};

function Applies(member: GuildMember, mode: 'add' | 'remove') {
  return ({ everyNth, roleSf }: DbAutoRole) =>
    (mode === 'add') !== member.roles.cache.has(`${roleSf}`) &&
    (everyNth === null ||
      BigInt(member.id) % BigInt(Math.max(2, everyNth)) ===
        (everyNth === 1 ? 1n : 0n));
}

async function MemberRoles(
  member: GuildMember,
  roles: DbAutoRole[],
  mode: 'add' | 'remove',
) {
  if (!roles.length) return;
  const toApply = roles.map(({ roleSf }) => `${roleSf}`);

  if (mode === 'remove') {
    await member.roles.remove(toApply).catch(() => {});
  } else {
    await member.roles.add(toApply).catch(() => {});
  }
}
