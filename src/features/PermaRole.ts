import { log, prisma } from '../infrastructure';
import { Feature } from '.';

/** Restore roles if somebody leaves and rejoins */
export const PermaRole: Feature = {
  /** Add new roles or remove old roles */
  async HandleMemberUpdate(oldMember, newMember) {
    const previousRoles = oldMember.roles.cache;
    const currentRoles = newMember.roles.cache;
    const addedRoles = currentRoles.filter(role => !previousRoles.has(role.id));
    const removedRoles = previousRoles.filter(
      role => !currentRoles.has(role.id),
    );
    if (!addedRoles.size && !removedRoles.size) return;
    const userSf = BigInt(newMember.id);
    await prisma.$transaction([
      ...addedRoles.map(({ id }) =>
        prisma.permaRole.create({ data: { userSf, roleSf: BigInt(id) } }),
      ),
      ...removedRoles.map(({ id }) =>
        prisma.permaRole.deleteMany({ where: { userSf, roleSf: BigInt(id) } }),
      ),
    ]);
  },
  /** Restore roles if any are stored */
  async HandleMemberAdd(member) {
    const userSf = BigInt(member.id);
    const permaRoles = await prisma.permaRole.findMany({
      select: { roleSf: true },
      where: { userSf },
    });
    const roleSnowflakes = permaRoles.map(({ roleSf }) => `${roleSf}`);
    if (!roleSnowflakes.length) return;
    await member.roles.add(roleSnowflakes);
    log('PermaRole restore', member.id, roleSnowflakes);
  },
};
