import { prisma } from '../infrastructure';
import { Feature } from '.';
import { AlertEvent, HandleAlert } from './Alert';

/** Restore roles if somebody leaves and rejoins */
export const PermaRole: Feature = {
  async HandleMemberUpdate(_, newMember) {
    const roles = newMember.roles.cache
      .filter(x => !x.managed)
      .map(x => BigInt(x.id));
    const userSf = BigInt(newMember.id);
    await prisma.$transaction([
      prisma.permaRole.deleteMany({ where: { userSf } }),
      prisma.permaRole.createMany({
        data: [...new Set(roles)].map(roleSf => ({ userSf, roleSf })),
      }),
    ]);
  },
  /** Restore roles if any are stored */
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const permaRoles = await prisma.permaRole.findMany({
      select: { roleSf: true },
      where: { userSf },
    });
    const roleSnowflakes = permaRoles.map(({ roleSf }) => `${roleSf}`);
    if (!roleSnowflakes.length) return;
    await member.roles.add(roleSnowflakes);
    const snowflakes = roleSnowflakes.map(sf => `<@&${sf}>`);
    const content = `Restored roles: ${snowflakes.join(', ')}`;
    //TODO: check if alert is entirely necessary
    await HandleAlert({ guildSf, userSf, event: AlertEvent.Roles, content });
  },
};
