import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';

export const Alert: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'alert',
      description: 'Create alerts for various events',
      options: [
        {
          name: 'user',
          description: 'Involving a user',
          type: ApplicationCommandOptionType.User,
        },
        {
          name: 'role',
          description: 'Involving a role',
          type: ApplicationCommandOptionType.Role,
        },
        {
          name: 'pattern',
          description:
            'Involving a message containing a RegExp pattern (case-insensitive)',
          type: ApplicationCommandOptionType.String,
        },
        {
          name: 'event',
          description: 'Based on an event',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'User Joins', value: 'join' },
            { name: 'User Leaves', value: 'leave' },
            { name: 'Role Assigned', value: 'role' },
          ],
        },
        {
          name: 'alt-reason',
          description: "Tokens: $content, $user (won't ping)",
          type: ApplicationCommandOptionType.String,
        },
      ],
    });
  },
  Interaction: {
    commandName: 'alert',
    moderatorOnly: true,
    async handler({ interaction, guildSf, channelSf }) {
      const { options } = interaction;
      await interaction.deferReply();

      const nStr = (x: any) => (x ? `${x}` : null);
      const userSf = nBigInt(options.get('user')?.user?.id);
      const roleSf = nBigInt(options.get('role')?.role?.id);
      const event = nStr(options.get('event')?.value);
      const pattern = nStr(options.get('pattern')?.value);
      const altReason = nStr(options.get('alt-reason')?.value);

      const alert = await prisma.alert.create({
        data: {
          ...{ guildSf, channelSf },
          ...{ userSf, roleSf, event, pattern, altReason },
        },
      });
      const criteria = alertInfo(userSf, roleSf, event, pattern);
      await interaction.editReply({
        content: `Alert ${alert.id} created: ${criteria} ${altReason ?? ''}`,
        allowedMentions: { parse: [] },
      });
    },
  },
  async HandleMemberRemove(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const roles = member.roles.cache.map(role => BigInt(role.id));
    await Handle({ guildSf, userSf, event: 'leave', roles });
  },
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    await Handle({ guildSf, userSf, event: 'join' });
  },
  async HandleMemberUpdate(oldMember, newMember) {
    const roles = newMember.roles.cache
      .filter(role => !oldMember.roles.cache.has(role.id))
      .map(role => BigInt(role.id));
    if (!roles.length) return;
    const guildSf = BigInt(newMember.guild.id);
    const userSf = BigInt(newMember.id);
    await Handle({ guildSf, userSf, event: 'role', roles });
  },
  async HandleMessage({ message, guildSf, userSf }) {
    const member = await message.guild?.members.fetch(message.author.id);
    const roles = member?.roles.cache.map(role => BigInt(role.id));
    await Handle({ guildSf, userSf, roles, content: message.content });
  },
};

export const DeleteAlert: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'delete-alert',
      description: 'Delete an alert by ID',
      options: [
        {
          name: 'id',
          description: 'The ID of the alert to delete',
          type: ApplicationCommandOptionType.Integer,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    commandName: 'delete-alert',
    moderatorOnly: true,
    async handler({ interaction, guildSf, channelSf }) {
      const { options } = interaction;
      const id = Number(options.get('id')?.value);

      if (!id) {
        await interaction.reply('Invalid Alert ID.');
        return;
      }
      await interaction.deferReply();

      const alert = await prisma.alert.findUnique({
        where: { id, guildSf, channelSf },
      });
      if (!alert) {
        await interaction.editReply(`Alert ${id} not found for this channel.`);
        return;
      }
      await prisma.alert.delete({ where: { id } });
      await interaction.editReply(`Alert ${id} deleted.`);
    },
  },
};

type HandleInfo = {
  guildSf: bigint;
  userSf?: bigint;
  event?: 'join' | 'leave' | 'role';
  roles?: bigint[];
  content?: string;
};
const Handle = async (i: HandleInfo) => {
  const alerts = await prisma.alert.findMany({
    where: {
      guildSf: i.guildSf,
      event: i.event,
      pattern: i.content ? { not: null } : undefined,
      AND: [
        { OR: [{ userSf: i.userSf }, { userSf: null }] },
        { OR: [{ roleSf: { in: i.roles } }, { roleSf: null }] },
      ],
    },
  });

  for (const a of alerts) {
    const { channelSf, userSf, roleSf, event, pattern } = a;
    const regex = pattern ? new RegExp(pattern, 'i') : null;
    if (regex && i.content && !regex.test(i.content)) continue;
    const channel = await client.channels.fetch(`${channelSf}`);
    if (!channel || channel.type !== ChannelType.GuildText) continue;

    const altReason = a.altReason
      ?.replaceAll(/\$content/g, i.content ?? '')
      .replaceAll(/\$user/g, `<@${i.userSf}>`);
    const content = altReason || alertInfo(userSf, roleSf, event, pattern);
    await channel.send({ content, allowedMentions: { parse: [] } });
  }
};

const alertInfo = (
  userSf: bigint | null,
  roleSf: bigint | null,
  event: string | null,
  pattern: string | null,
) => {
  const u = userSf ? `<@${userSf}>` : 'any user';
  const r = roleSf ? `<@&${roleSf}>` : 'any role';
  const e = event ?? 'any event';
  const p = pattern ?? 'none';
  return `${u}, ${r}, ${e}, pattern: \`${p}\``;
};

const nBigInt = (x: any) => (x ? BigInt(x) : null);
