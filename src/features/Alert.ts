import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';

export enum AlertEvent {
  Message = 'message',
  Join = 'join',
  Leave = 'leave',
  Role = 'role',
  Roles = 'roles',
  Note = 'note',
  Audit = 'audit',
  Milestone = 'milestone',
}

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
            { name: 'Message sent', value: 'message' },
            { name: 'User joins', value: 'join' },
            { name: 'User leaves', value: 'leave' },
            { name: 'Role assigned', value: 'role' },
            { name: 'Roles restored', value: 'roles' },
            { name: 'Note created', value: 'note' },
            { name: 'Moderation action', value: 'audit' },
            { name: 'Membership milestone', value: 'milestone' },
          ],
          required: true,
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
            'Involving a message containing a regex pattern (case-insensitive)',
          type: ApplicationCommandOptionType.String,
        },
        {
          name: 'alt-reason',
          description: "Tokens: $content, $url, $user (won't ping)",
          type: ApplicationCommandOptionType.String,
        },
      ],
    });
  },
  Interaction: {
    name: 'alert',
    moderatorOnly: true,
    async command({ interaction, guildSf, channelSf }) {
      const { options } = interaction;
      await interaction.deferReply();

      const event = options.getString('event');
      const userSf = nBigInt(options.get('user')?.user?.id);
      const roleSf = nBigInt(options.get('role')?.role?.id);
      const pattern = options.getString('pattern');
      const altReason = options.getString('alt-reason');

      if (!event) {
        await interaction.editReply('An event must be provided.');
        return;
      }

      const alert = await prisma.alert.create({
        data: {
          ...{ guildSf, channelSf },
          ...{ userSf, roleSf, event, pattern, altReason },
        },
      });
      const criteria = alertInfo(event, userSf, roleSf, pattern);
      await interaction.editReply({
        content: `Alert ${alert.id} created: ${criteria}, ${altReason ?? ''}`,
        allowedMentions: { parse: [] },
      });
    },
  },
  async HandleMemberRemove(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const roles = member.roles.cache.map(role => BigInt(role.id));
    await HandleAlert({ guildSf, userSf, event: AlertEvent.Leave, roles });
  },
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    await HandleAlert({ guildSf, userSf, event: AlertEvent.Join });
    const count = member.guild.memberCount;
    if ((count < 100 && !(count % 10)) || count % 100 === 0) {
      const content = `${count} members :tada:`;
      await HandleAlert({ guildSf, event: AlertEvent.Milestone, content });
    }
  },
  async HandleMemberUpdate(oldMember, newMember) {
    const roles = newMember.roles.cache
      .filter(role => !oldMember.roles.cache.has(role.id))
      .map(role => BigInt(role.id));
    if (!roles.length) return;
    const guildSf = BigInt(newMember.guild.id);
    const userSf = BigInt(newMember.id);
    const content = roles.map(r => `<@&${r}>`).join(', ');
    await HandleAlert({
      guildSf,
      userSf,
      event: AlertEvent.Role,
      roles,
      content,
    });
  },
  async HandleMessage({ message, guildSf, userSf }) {
    if (!message.content) return;
    const member = await message.guild?.members.fetch(message.author.id);
    const roles = member?.roles.cache.map(role => BigInt(role.id));
    await HandleAlert({
      guildSf,
      userSf,
      event: AlertEvent.Message,
      roles,
      content: message.content,
      url: message.url,
    });
  },
  async HandleAuditLog({ kind, executor, target, reason }, guild) {
    const guildSf = BigInt(guild.id);
    const by = executor ? `<@${executor.id}>` : '[unknown]';
    const of = target ? `<@${target.id}> (\`${target.tag}\`)` : '[unknown]';
    const content = `${kind} of ${of} by ${by}: ${reason}`;
    await HandleAlert({ guildSf, event: AlertEvent.Audit, content });
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
    name: 'delete-alert',
    moderatorOnly: true,
    async command({ interaction, guildSf, channelSf }) {
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

export const DeleteAlerts: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'delete-alerts',
      description: 'Delete all alerts in this channel',
    });
  },
  Interaction: {
    name: 'delete-alerts',
    moderatorOnly: true,
    async command({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();
      const { count } = await prisma.alert.deleteMany({
        where: { guildSf, channelSf },
      });
      await interaction.editReply(`Deleted ${count} alerts.`);
    },
  },
};

export const RecommendedAlerts: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'recommended-alerts',
      description: 'Set up recommended alerts in this channel',
    });
  },
  Interaction: {
    name: 'recommended-alerts',
    moderatorOnly: true,
    async command({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();

      await prisma.alert.createMany({
        data: [
          {
            guildSf,
            channelSf,
            event: AlertEvent.Join,
            altReason: '$user joined',
          },
          {
            guildSf,
            channelSf,
            event: AlertEvent.Leave,
            altReason: '$user left',
          },
          { guildSf, channelSf, event: AlertEvent.Role },
          { guildSf, channelSf, event: AlertEvent.Roles },
          { guildSf, channelSf, event: AlertEvent.Note },
          { guildSf, channelSf, event: AlertEvent.Audit },
          { guildSf, channelSf, event: AlertEvent.Milestone },
        ],
      });

      await interaction.editReply('Recommended alerts set up.');
    },
  },
};

type HandleInfo = {
  event: AlertEvent;
  guildSf: bigint;
  userSf?: bigint;
  roles?: bigint[];
  content?: string | null;
  url?: string;
};
export const HandleAlert = async (i: HandleInfo) => {
  const requireContent =
    i.event &&
    [
      AlertEvent.Note,
      AlertEvent.Audit,
      AlertEvent.Role,
      AlertEvent.Roles,
      AlertEvent.Milestone,
    ].includes(i.event);
  const alerts = await prisma.alert.findMany({
    where: {
      guildSf: i.guildSf,
      event: i.event,
      pattern: i.content && !requireContent ? { not: null } : undefined,
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
      .replaceAll(/\$user/g, `<@${i.userSf}>`)
      .replaceAll(/\$url/g, i.url ?? '[no URL]');
    const info = alertInfo(event, userSf ?? i.userSf ?? null, roleSf, pattern);
    const content =
      `||${a.id}|| ` +
      (altReason || info) +
      (requireContent ? `: ${i.content}` : '');
    await channel.send({ content, allowedMentions: { parse: [] } });
  }
};

const alertInfo = (
  event: string,
  userSf: bigint | null,
  roleSf: bigint | null,
  pattern: string | null,
) => {
  const parts = [
    event,
    userSf ? `<@${userSf}>` : null,
    roleSf ? `<@&${roleSf}>` : null,
    pattern ? `\`${pattern}\` pattern` : null,
  ].filter(Boolean);
  return parts.join(', ');
};

const nBigInt = (x: any) => (x ? BigInt(x) : null);
