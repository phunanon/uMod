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
          name: 'event',
          description: 'Based on an event',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'User joins', value: 'join' },
            { name: 'User leaves', value: 'leave' },
            { name: 'Role assigned', value: 'role' },
            { name: 'Roles restored', value: 'roles' },
            { name: 'Note created', value: 'note' },
            { name: 'Moderation action', value: 'audit' },
          ],
        },
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
    await HandleAlert({ guildSf, userSf, event: 'leave', roles });
  },
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    await HandleAlert({ guildSf, userSf, event: 'join' });
  },
  async HandleMemberUpdate(oldMember, newMember) {
    const roles = newMember.roles.cache
      .filter(role => !oldMember.roles.cache.has(role.id))
      .map(role => BigInt(role.id));
    if (!roles.length) return;
    const guildSf = BigInt(newMember.guild.id);
    const userSf = BigInt(newMember.id);
    await HandleAlert({ guildSf, userSf, event: 'role', roles });
  },
  async HandleMessage({ message, guildSf, userSf }) {
    if (!message.content) return;
    const member = await message.guild?.members.fetch(message.author.id);
    const roles = member?.roles.cache.map(role => BigInt(role.id));
    await HandleAlert({ guildSf, userSf, roles, content: message.content });
  },
  async HandleAuditLog({ kind, executor, target, reason }, guild) {
    const guildSf = BigInt(guild.id);
    const content = `${kind} of <@${target.id}> by <@${executor.id}>: ${reason}`;
    await HandleAlert({ guildSf, event: 'audit', content });
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
  event?: 'join' | 'leave' | 'role' | 'roles' | 'note' | 'audit';
  roles?: bigint[];
  content?: string | null;
};
export const HandleAlert = async (i: HandleInfo) => {
  const extraDetailsEvent =
    i.event && ['note', 'audit', 'roles'].includes(i.event);
  const alerts = await prisma.alert.findMany({
    where: {
      guildSf: i.guildSf,
      event: i.event ? i.event : null,
      pattern: i.content && !extraDetailsEvent ? { not: null } : undefined,
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
      ?.replaceAll(/\$content/g, i.content ?? '[no content]')
      .replaceAll(/\$user/g, `<@${i.userSf}>`);
    const info = alertInfo(userSf ?? i.userSf ?? null, roleSf, event, pattern);
    const content =
      `||${a.id}|| ` +
      (altReason || info) +
      (extraDetailsEvent ? `: ${i.content}` : '');
    await channel.send({ content, allowedMentions: { parse: [] } });
  }
};

const alertInfo = (
  userSf: bigint | null,
  roleSf: bigint | null,
  event: string | null,
  pattern: string | null,
) => {
  const parts = [
    userSf ? `<@${userSf}>` : null,
    roleSf ? `<@&${roleSf}>` : null,
    event,
    pattern ? `\`${pattern}\` pattern` : null,
  ].filter(Boolean);
  return parts.join(', ');
};

const nBigInt = (x: any) => (x ? BigInt(x) : null);
