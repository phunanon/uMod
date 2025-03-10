import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { client, prisma, isGoodChannel } from '../infrastructure';

export enum AlertEvent {
  Message = 'message',
  Join = 'join',
  Leave = 'leave',
  JoinVC = 'join-vc',
  LeaveVC = 'leave-vc',
  Role = 'role',
  Roles = 'roles',
  Note = 'note',
  Audit = 'audit',
  Milestone = 'milestone',
  FirstMessage = 'first-message',
  //TODO: LevelUp = 'level-up',
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
            { name: 'Message sent', value: AlertEvent.Message },
            { name: 'User joins server', value: AlertEvent.Join },
            { name: 'User leaves server', value: AlertEvent.Leave },
            { name: 'User joins VC', value: AlertEvent.JoinVC },
            { name: 'User leaves VC', value: AlertEvent.LeaveVC },
            { name: 'Role assigned', value: AlertEvent.Role },
            { name: 'Roles restored', value: AlertEvent.Roles },
            { name: 'Note created', value: AlertEvent.Note },
            { name: 'Moderation action', value: AlertEvent.Audit },
            { name: 'Membership milestone', value: AlertEvent.Milestone },
            { name: 'First message sent', value: AlertEvent.FirstMessage },
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
          description:
            "Tokens: $content, $url, $tag, $user (won't ping), $ping; \\n for newline",
          type: ApplicationCommandOptionType.String,
        },
        {
          name: 'cooldown-seconds',
          description: 'Alert cooldown in seconds',
          type: ApplicationCommandOptionType.Integer,
          minValue: 1,
          maxValue: 3600,
        },
        {
          name: 'in-situ',
          description: 'Send alert only if message sent in this channel',
          type: ApplicationCommandOptionType.Boolean,
        },
        {
          name: 'auto-delete',
          description: 'Auto delete alert message after this many seconds',
          type: ApplicationCommandOptionType.Integer,
          minValue: 1,
          maxValue: 300,
        },
      ],
    });
  },
  Interaction: {
    name: 'alert',
    needPermit: 'Alerts',
    async command({ interaction, guildSf, channelSf }) {
      const { options } = interaction;
      await interaction.deferReply();

      const event = options.getString('event', true);
      const userSf = nBigInt(options.get('user')?.user?.id);
      const roleSf = nBigInt(options.get('role')?.role?.id);
      const pattern = options.getString('pattern');
      const altReason = options
        .getString('alt-reason')
        ?.replaceAll('\\n', '\n');
      const cooldownSec =
        options.getInteger('cooldown-seconds') ??
        (event === 'milestone' ? 86_400 : null);
      const insitu = options.getBoolean('in-situ') ?? false;
      const autoDeleteSec = options.getInteger('auto-delete');

      const alert = await prisma.alert.create({
        data: {
          ...{ guildSf, channelSf },
          ...{ userSf, roleSf, event, pattern, altReason, cooldownSec, insitu },
          ...{ autoDeleteSec },
        },
      });
      const criteria = alertInfo(
        ...[event, userSf, roleSf, pattern, cooldownSec, insitu, autoDeleteSec],
      );
      await interaction.editReply({
        content: `Alert ${alert.id} created: ${criteria}, ${altReason ?? ''}`,
        allowedMentions: { parse: [] },
      });
    },
  },
  async HandleMemberRemove(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const { tag } = member.user;
    const roles = member.roles.cache.map(role => BigInt(role.id));
    await HandleAlert({ guildSf, userSf, tag, event: AlertEvent.Leave, roles });
  },
  async HandleMemberAdd(member) {
    const guildSf = BigInt(member.guild.id);
    const userSf = BigInt(member.id);
    const { tag } = member.user;
    await HandleAlert({ guildSf, userSf, tag, event: AlertEvent.Join });
    const count = member.guild.memberCount;
    if ((count < 100 && !(count % 10)) || count % 100 === 0) {
      const content = `${count.toLocaleString()} members :tada:`;
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
    await HandleAlert({
      guildSf,
      userSf,
      tag: newMember.user.tag,
      event: AlertEvent.Role,
      roles,
    });
  },
  async HandleMessageCreate({ message, guildSf, channelSf, userSf, member }) {
    if (!message.content) return;
    const roles = member.roles.cache.map(role => BigInt(role.id));

    await HandleAlert({
      ...{ guildSf, channelSf, userSf, tag: member.user.tag },
      event: AlertEvent.Message,
      roles,
      content: message.content,
      url: message.url,
    });

    const stats = await prisma.member.findFirst({
      where: { guildSf, userSf },
      select: { id: true, numMessages: true },
    });
    if (stats?.numMessages === 1) {
      //To mitigate double-welcomes
      await prisma.member.update({
        where: { id: stats.id },
        data: { numMessages: { increment: 1 } },
      });
      await HandleAlert({
        ...{ guildSf, userSf, channelSf, tag: member.user.tag },
        event: AlertEvent.FirstMessage,
        roles,
        url: message.url,
      });
    }
  },
  async HandleAuditLog({ kind, executor, target, reason }, guild) {
    const guildSf = BigInt(guild.id);
    const selfExecution =
      executor?.id === client.user?.id && !reason?.includes('Rule enforcement');
    const auto = selfExecution ? 'auto-' : '';
    const executorTag = executor ? `<@${executor.id}>` : '[unknown]';
    const by = selfExecution ? '' : ` by ${executorTag}`;
    const of = target ? `<@${target.id}> (\`${target.tag}\`)` : '[unknown]';
    const reasonWithColon = reason ? `: ${reason}` : '';
    const content = `${auto}${kind} of ${of}${by}${reasonWithColon}`;
    await HandleAlert({ guildSf, event: AlertEvent.Audit, content });
  },
  async HandleChannelDelete(channel) {
    const channelSf = BigInt(channel.id);
    await prisma.alert.deleteMany({ where: { channelSf } });
  },
  async HandleVoiceStateUpdate(oldState, newState) {
    if (oldState.channelId === newState.channelId) return;
    const guildSf = BigInt(newState.guild.id);
    const userSf = BigInt(newState.id);
    const from = oldState.channel;
    const to = newState.channel;
    const alert = {
      guildSf,
      userSf,
      tag: newState.member?.user.tag,
    };
    if (from)
      await HandleAlert({
        ...alert,
        event: AlertEvent.LeaveVC,
        content: from.name,
      });
    if (to)
      await HandleAlert({
        ...alert,
        event: AlertEvent.JoinVC,
        content: to.name,
      });
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
    needPermit: 'Alerts',
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
    needPermit: 'Alerts',
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
    needPermit: 'Alerts',
    async command({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();

      await prisma.alert.createMany({
        data: [
          {
            guildSf,
            channelSf,
            event: AlertEvent.Join,
            altReason: '$user ($tag) joined',
          },
          {
            guildSf,
            channelSf,
            event: AlertEvent.Leave,
            altReason: '$user ($tag) left',
          },
          {
            guildSf,
            channelSf,
            event: AlertEvent.JoinVC,
            altReason: '$user ($tag) joined $content',
          },
          {
            guildSf,
            channelSf,
            event: AlertEvent.LeaveVC,
            altReason: '$user ($tag) left $content',
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
  channelSf?: bigint;
  userSf?: bigint;
  tag?: string;
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
      AlertEvent.Roles,
      AlertEvent.Milestone,
    ].includes(i.event);
  const alerts = await prisma.alert.findMany({
    where: {
      guildSf: i.guildSf,
      event: i.event,
      OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: new Date() } }],
      AND: [
        { OR: [{ userSf: i.userSf }, { userSf: null }] },
        { OR: [{ roleSf: { in: i.roles } }, { roleSf: null }] },
        {
          OR: [
            ...(i.channelSf ? [{ insitu: true, channelSf: i.channelSf }] : []),
            { insitu: false },
          ],
        },
      ],
    },
  });

  for (const a of alerts) {
    const { id, channelSf, userSf, roleSf, ...other } = a;
    const { event, pattern, cooldownSec, insitu, autoDeleteSec } = other;
    const regex = pattern ? new RegExp(pattern, 'i') : null;
    if (regex && i.content && !regex.test(i.content)) continue;
    const channel = await client.channels.fetch(`${channelSf}`);
    if (!isGoodChannel(channel)) continue;
    const uSf = userSf ?? i.userSf ?? null;

    const altReason = a.altReason
      ?.replaceAll(/\$content/g, i.content ?? '[no content]')
      .replaceAll(/\$user/g, uSf ? `<@${uSf}>` : '[unknown $user]')
      .replaceAll(/\$ping/g, uSf ? `<@${uSf}>` : '[unknown $ping]')
      .replaceAll(
        /\$tag/g,
        i.tag?.replaceAll(/([_*])/g, '\\$1') ?? '[unknown $tag]',
      )
      .replaceAll(/\$url/g, i.url ?? '[no URL]');
    const info = alertInfo(
      ...[event, uSf, roleSf, pattern, cooldownSec, insitu, autoDeleteSec],
    );
    const allowedMentions =
      a.altReason?.includes('$ping') && uSf
        ? { users: [`${uSf}`] }
        : { parse: [] };
    const roleContent = roleSf
      ? `<@&${roleSf}>`
      : i.roles?.map(r => `<@&${r}>`).join(', ') ?? '';
    const content =
      `||${id}|| ` +
      (altReason || info) +
      (requireContent ? `: ${i.content}` : '') +
      (event === AlertEvent.Role ? `: ${roleContent}` : '');

    const message = await channel.send({ content, allowedMentions });

    if (cooldownSec) {
      const cooldownUntil = new Date(new Date().getTime() + cooldownSec * 1000);
      await prisma.alert.update({ where: { id }, data: { cooldownUntil } });
    }
    if (autoDeleteSec) {
      setTimeout(async () => {
        await message.delete();
      }, autoDeleteSec * 1000);
    }
  }
};

const alertInfo = (
  event: string,
  userSf: bigint | null,
  roleSf: bigint | null,
  pattern: string | null,
  cooldownSec: number | null,
  insitu: boolean | null,
  autoDeleteSec: number | null,
) => {
  const parts = [
    event,
    userSf ? `<@${userSf}>` : null,
    roleSf ? `<@&${roleSf}>` : null,
    pattern ? `\`${pattern}\` pattern` : null,
    cooldownSec && event !== 'milestone' ? `${cooldownSec}s cooldown` : null,
    insitu ? 'in-situ' : null,
    autoDeleteSec ? `${autoDeleteSec}s auto-delete` : null,
  ].filter(Boolean);
  return parts.join(', ');
};

const nBigInt = (x: any) => (x ? BigInt(x) : null);
