import { prisma } from '../infrastructure';
import { Feature } from '.';

//TODO: add guildSf - a bit dumb that I never did
//TODO: add a way to blacklist roles from being restored

/** Restore roles if somebody leaves and rejoins */
export const PermaRole: Feature = {
  async HandleMemberUpdate(_, newMember) {
    const roles = newMember.roles.cache
      .filter(x => !x.managed)
      .map(x => BigInt(x.id));
    const userSf = BigInt(newMember.id);
    const data = [...new Set(roles)]
      .filter(x => x !== BigInt(newMember.guild.id))
      .map(roleSf => ({ userSf, roleSf }));
    await prisma.$transaction([
      prisma.permaRole.deleteMany({ where: { userSf } }),
      prisma.permaRole.createMany({ data }),
    ]);
  },
  /** Restore roles if any are stored */
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const permaRoles = await prisma.permaRole.findMany({
      where: { userSf },
      select: { roleSf: true },
    });
    const permRoles = await prisma.guildPermission.findMany({
      where: { guildSf },
      select: { roleSf: true },
    });
    const allRoles = await member.guild.roles.fetch();
    const theseRoles = allRoles
      //Only restore roles that still exist
      .filter(x => permaRoles.some(y => y.roleSf === BigInt(x.id)))
      //Don't restore roles that have permissions
      .filter(x => !permRoles.some(y => y.roleSf === BigInt(x.id)));
    if (!theseRoles.size) return;
    await member.roles.add(theseRoles);
  },
};
