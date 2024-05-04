import { GuildMember } from 'discord.js';
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
    const userSnowflake = BigInt(newMember.id);
    await prisma.$transaction([
      ...addedRoles.map(({ id }) =>
        prisma.permaRole.create({
          data: { userSnowflake, roleSnowflake: BigInt(id) },
        }),
      ),
      ...removedRoles.map(({ id }) =>
        prisma.permaRole.deleteMany({
          where: { userSnowflake, roleSnowflake: BigInt(id) },
        }),
      ),
    ]);
    log(
      'MemberUpdate',
      newMember.id,
      addedRoles.map(role => role.id),
      removedRoles.map(role => role.id),
    );
  },
  /** Restore roles if any are stored */
  async HandleMemberAdd(member: GuildMember) {
    const userSnowflake = BigInt(member.id);
    const permaRoles = await prisma.permaRole.findMany({
      select: { roleSnowflake: true },
      where: { userSnowflake },
    });
    const roleSnowflakes = permaRoles.map(
      ({ roleSnowflake }) => `${roleSnowflake}`,
    );
    await member.roles.add(roleSnowflakes);
    log('MemberAdd', member.id, roleSnowflakes);
  },
  async HandleMessageCreate() {},
};
