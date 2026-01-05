import { Feature } from '.';
import { client, prisma } from '../infrastructure';

/** Updates the `present` column of Member for each guild */
export const PresenceCheck: Feature = {
  async Init() {
    setTimeout(CheckPresence, 30_000);
  },
};

async function CheckPresence() {
  for (const guild of (await client.guilds.fetch()).values()) {
    const guildMembers = await (await guild.fetch()).members.fetch();
    const dbMembers = await prisma.member.findMany({
      where: { guildSf: BigInt(guild.id) },
    });
    const noLongerPresent: number[] = [];
    const nowPresent: number[] = [];
    const inVc: bigint[] = [];
    const outVc: bigint[] = [];
    for (const dbMember of dbMembers) {
      const member = guildMembers.get(dbMember.userSf.toString());
      if (dbMember.present && !member) noLongerPresent.push(dbMember.id);
      if (!dbMember.present && member) nowPresent.push(dbMember.id);
      if (member) {
        const list = member.voice.channelId ? inVc : outVc;
        list.push(BigInt(member.id));
      }
    }
    await prisma.member.updateMany({
      where: { id: { in: noLongerPresent } },
      data: { present: false },
    });
    await prisma.member.updateMany({
      where: { id: { in: nowPresent } },
      data: { present: true },
    });
    await prisma.member.updateMany({
      where: { userSf: { in: inVc } },
      data: { inVc: true },
    });
    await prisma.member.updateMany({
      where: { userSf: { in: outVc } },
      data: { inVc: false },
    });
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  setTimeout(CheckPresence, 600_000);
}
