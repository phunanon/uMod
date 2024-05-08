import {
  ApplicationCommandOptionType,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { Feature, InteractionGuard, MessageGuard } from '.';
import { client, prisma } from '../infrastructure';
import { Alert as DbAlert, Prisma } from '@prisma/client';

export const Alert: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'alert',
      description: 'Create alerts for various events',
      options: [
        {
          name: 'user',
          description: 'Based on a user',
          type: ApplicationCommandOptionType.User,
        },
        {
          name: 'role',
          description: 'Based on a role being assigned or users with a role',
          type: ApplicationCommandOptionType.Role,
        },
        {
          name: 'event',
          description: 'Based on an event',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'User Joins', value: 'join' },
            { name: 'User Leaves', value: 'leave' },
          ],
        },
        {
          name: 'pattern',
          description: 'Based on a message containing a RegExp pattern',
          type: ApplicationCommandOptionType.String,
        },
        {
          name: 'mention',
          description: 'Ping a user or role when the alert is triggered',
          type: ApplicationCommandOptionType.Mentionable,
        },
        {
          name: 'alt-reason',
          description: 'Use a custom reason instead of the default',
          type: ApplicationCommandOptionType.String,
        },
      ],
    });
  },
  async HandleInteractionCreate(interaction) {
    const info = await InteractionGuard(interaction, 'alert', true);
    if (!info) return;
    const { chatInteraction, guildSf, channelSf } = info;
    const { options } = chatInteraction;

    const nBigInt = (x: string | undefined) => (x ? BigInt(x) : null);
    const nStr = (x: any) => (x ? `${x}` : null);
    const userSf = nBigInt(options.get('user')?.user?.id);
    const roleSf = nBigInt(options.get('role')?.role?.id);
    const event = nStr(options.get('event')?.value);
    const pattern = nStr(options.get('pattern')?.value);
    const mention = nBigInt(
      options.get('mention')?.role?.id ?? options.get('mention')?.user?.id,
    );
    const altReason = nStr(options.get('alt-reason')?.value);

    if (!userSf && !roleSf && !pattern && !event) {
      await chatInteraction.reply('Must have a user, role, pattern, or event');
      return;
    }
    if (userSf && roleSf) {
      await chatInteraction.reply('Cannot have both user and role');
      return;
    }
    if (pattern && event) {
      await chatInteraction.reply('Cannot have both pattern and event');
      return;
    }
    //TODO: do a matrix of mutually exclusive options

    await chatInteraction.deferReply();

    await prisma.alert.create({
      data: {
        ...{ guildSf, channelSf },
        ...{ userSf, roleSf, event, pattern },
        ...{ mention, altReason },
      },
    });
    await chatInteraction.editReply('Alert created');
  },
  async HandleMemberRemove(member) {
    const [guildSf, userSf] = [member.guild.id, member.id].map(BigInt);
    const roles = member.roles.cache.map(role => BigInt(role.id));
    const where: Prisma.AlertWhereInput = {
      guildSf,
      event: 'leave',
      AND: [
        { OR: [{ userSf }, { userSf: null }] },
        { OR: [{ roleSf: { in: roles } }, { roleSf: null }] },
      ],
    };
    await triggerAlerts(where, { userSf });
  },
  async HandleMemberAdd(member) {
    const [guildSf, userSf] = [member.guild.id, member.id].map(BigInt);
    const where: Prisma.AlertWhereInput = {
      guildSf,
      event: 'join',
      OR: [{ userSf }, { userSf: null }],
    };
    await triggerAlerts(where, { userSf });
  },
  async HandleMemberUpdate(oldMember, newMember) {
    const newRole = newMember.roles.cache.find(
      role => !oldMember.roles.cache.has(role.id),
    );
    if (!newRole) return;
    const guildSf = BigInt(newMember.guild.id);
    const userSf = BigInt(newMember.id);
    const roleSf = BigInt(newRole.id);
    const where: Prisma.AlertWhereInput = {
      guildSf,
      roleSf,
      OR: [{ userSf }, { userSf: null }],
    };
    await triggerAlerts(where, { roleSf, userSf });
  },
  async HandleMessageCreate(message) {
    const info = await MessageGuard(message);
    if (!info) return;
    const { guildSf, userSf, channel } = info;

    const alerts = await prisma.alert.findMany({
      where: {
        guildSf,
        pattern: { not: null },
        OR: [{ userSf }, { userSf: null }],
      },
    });

    for (const alert of alerts) {
      if (RegExp(alert.pattern!).test(message.content)) {
        await triggerAlert(channel, alert);
      }
    }
  },
};

const triggerAlerts = async (
  where: Prisma.AlertWhereInput,
  overrides: Partial<DbAlert>,
) => {
  const alerts = await prisma.alert.findMany({ where });
  for (const alert of alerts) {
    const channel = await client.channels.fetch(`${alert.channelSf}`);
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    await triggerAlert(channel, { ...alert, ...overrides });
  }
};

const triggerAlert = async (channel: TextChannel, alert: DbAlert) => {
  const { userSf, roleSf, event, pattern, altReason } = alert;

  const makeReason = async () => {
    if (event) {
      const ofRole = roleSf ? ` of <@&${roleSf}>` : '';
      return `<@${userSf}>${ofRole} ${event === 'join' ? 'joined' : 'left'}`;
    }
    if (roleSf) {
      const role = await channel.guild.roles.fetch(`${roleSf}`);
      return `${role} assigned to <@${userSf}>`;
    }
    if (pattern) {
      return `Message contains: ${pattern}`;
    }
    return 'Unknown reason';
  };

  const reason = altReason ?? (await makeReason());
  const mention = alert.mention ? `<@&${alert.mention}>` : '';

  await channel.send({
    content: `${reason} ${mention}`,
    allowedMentions: { users: [`${alert.mention}`] },
  });
};
