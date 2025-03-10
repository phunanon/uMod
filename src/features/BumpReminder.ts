import { Feature } from '.';
import { ButtonStyle, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { client, isGoodChannel, prisma } from '../infrastructure';

const DisboardSf = '302050872383242240';
const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60_000);
const inTwoAndAHalfHours = () => new Date(Date.now() + 2.5 * 60 * 60_000);
const inThirtyMinutes = () => new Date(Date.now() + 30 * 60_000);

export const BumpReminder: Feature = {
  async Init(commands) {
    TickSoon();
    await commands.create({
      name: 'bump-reminder',
      description:
        'Enable or disable a two hour bump reminder in this channel (one per guild)',
    });
  },
  async HandleBotMessage({ message, guildSf }) {
    if (message.author.id !== DisboardSf) return;
    const [embed] = message.embeds;
    if (!embed?.description?.includes('Bump done!')) return;

    await prisma.bumpReminder.updateMany({
      where: { guildSf },
      data: { remindAt: inTwoHours(), softRemindAt: inTwoAndAHalfHours() },
    });
  },
  Interaction: {
    name: 'bump-reminder',
    needPermit: 'ChannelConfig',
    async command({ interaction, guildSf, channelSf }) {
      await interaction.deferReply();

      const where = { guildSf };
      const existing = await prisma.bumpReminder.findFirst({ where });

      if (existing) {
        await prisma.bumpReminder.delete({ where: { id: existing.id } });
        await interaction.editReply('Bump reminder disabled.');
        return;
      }

      await prisma.bumpReminder.create({
        data: {
          guildSf,
          channelSf,
          remindAt: new Date(),
          softRemindAt: inThirtyMinutes(),
        },
      });

      await interaction.editReply('Bump reminder enabled.');
    },
  },
};

export const SoftBumpReminder: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'soft-bump-reminder',
      description:
        'Toggle an additional thirty minute reminder in another channel for bumps.',
    });
  },
  Interaction: {
    name: 'soft-bump-reminder',
    needPermit: 'ChannelConfig',
    async command({ interaction, guildSf, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const reminder = await prisma.bumpReminder.findFirst({
        where: { guildSf },
      });

      if (!reminder) {
        await interaction.editReply(
          'You need to set up a `/bump-reminder` in another channel first.',
        );
        return;
      }

      if (reminder.channelSf === channelSf) {
        await interaction.editReply(
          'Soft reminders should be used elsewhere, not in the existing bump reminder channel.',
        );
        return;
      }

      if (reminder.softChannelSf) {
        await prisma.bumpReminder.update({
          where: { id: reminder.id },
          data: { softChannelSf: null },
        });
        await interaction.editReply('Soft bump reminder disabled.');
        return;
      }

      await prisma.bumpReminder.update({
        where: { id: reminder.id },
        data: { softChannelSf: channelSf },
      });

      await interaction.editReply('Soft bump reminder enabled.');
    },
  },
};

export const BumpRemind: Feature = {
  Interaction: {
    name: 'bump-remind',
    async button({ interaction, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const reminder = await prisma.bumpReminder.findFirst({
        where: { guildSf },
        select: { id: true, Users: true },
      });

      if (!reminder) {
        await interaction.editReply('Bump reminders are not enabled.');
        return;
      }

      if (reminder.Users.some(u => u.userSf === userSf)) {
        await interaction.editReply(
          'You are already subscribed to bump reminders.',
        );
        return;
      }

      await prisma.bumpReminderUser.create({
        data: { userSf, bumpReminderId: reminder.id },
      });

      await interaction.editReply(
        "You will be reminded next time (if you're online).",
      );
    },
  },
};

export const BumpUnremind: Feature = {
  Interaction: {
    name: 'bump-unremind',
    async button({ interaction, guildSf, userSf }) {
      await interaction.deferReply({ ephemeral: true });

      const reminder = await prisma.bumpReminderUser.findFirst({
        where: { userSf, BumpReminder: { guildSf } },
      });

      if (!reminder) {
        await interaction.editReply('You are already not subscribed.');
        return;
      }

      await prisma.bumpReminderUser.delete({ where: { id: reminder.id } });

      await interaction.editReply('You will no longer be reminded.');
    },
  },
};

function TickSoon() {
  setTimeout(async () => {
    await tick();
    TickSoon();
  }, 30_000);
}

async function tick() {
  const hardReminders = await prisma.bumpReminder.findMany({
    where: { remindAt: { lte: new Date() } },
    select: { Users: { select: { userSf: true } }, channelSf: true, id: true },
  });

  for (const reminder of hardReminders) {
    try {
      await hardRemind(reminder);
      //Postpone the reminder by two more hours
      await prisma.bumpReminder.update({
        where: { id: reminder.id },
        data: { remindAt: inTwoHours(), softRemindAt: inTwoAndAHalfHours() },
      });
    } catch (e) {
      console.error(reminder, e);
      if (RegExp(/Unknown Channel|Missing Access/).test(`${e}`)) {
        await prisma.bumpReminder.delete({ where: { id: reminder.id } });
        console.log('Deleted reminder');
      }
    }
  }

  const softReminders = await prisma.bumpReminder.findMany({
    where: { softRemindAt: { lte: new Date() }, softChannelSf: { not: null } },
    select: { softChannelSf: true, id: true },
  });

  for (const reminder of softReminders) {
    try {
      await softRemind({ channelSf: reminder.softChannelSf!, id: reminder.id });
      //Postpone the reminder by thirty minutes
      await prisma.bumpReminder.update({
        where: { id: reminder.id },
        data: { softRemindAt: inThirtyMinutes() },
      });
    } catch (e) {
      console.error(reminder, e);
      if (RegExp(/Unknown Channel|Missing Access/).test(`${e}`)) {
        await prisma.bumpReminder.update({
          where: { id: reminder.id },
          data: { softChannelSf: null },
        });
        console.log('Disabled soft reminder');
      }
    }
  }
}

type SoftReminder = { id: number; channelSf: bigint };
type HardReminder = SoftReminder & { Users: { userSf: bigint }[] };

async function hardRemind({ id, channelSf, Users }: HardReminder) {
  const channel = await client.channels.fetch(`${channelSf}`);
  if (!isGoodChannel(channel)) {
    await prisma.bumpReminder.delete({ where: { id } });
    console.log(`Deleting reminder for channel ${channelSf}`);
    return;
  }

  const members = await channel.guild.members.fetch({
    user: Users.map(u => `${u.userSf}`),
  });
  const onlineUsers = members.filter(m => m.presence?.status === 'online');
  const idleUsers = members.filter(m => m.presence?.status === 'idle');
  const dndUsers = members.filter(m => m.presence?.status === 'dnd');
  const pingUsers = onlineUsers.size
    ? onlineUsers
    : idleUsers.size
    ? idleUsers
    : dndUsers;
  const content =
    Users.filter(u => pingUsers.has(`${u.userSf}`))
      .map(u => `<@${u.userSf}>`)
      .join(' ') || '.';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('bump-remind')
      .setLabel("Notify me whenever I'm online")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('bump-unremind')
      .setLabel('Unsubscribe')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content,
    embeds: [
      {
        title: 'Bump Reminder',
        description: 'It is time to bump the server! Use `/bump` to do so.',
        color: 0x2f6f7f,
      },
    ],
    components: [row],
  });
}

async function softRemind({ id, channelSf }: SoftReminder) {
  const channel = await client.channels.fetch(`${channelSf}`);
  if (!isGoodChannel(channel)) {
    await prisma.bumpReminder.update({
      where: { id },
      data: { softChannelSf: null },
    });
    console.log(`Disabling soft reminder for channel ${channelSf}`);
    return;
  }

  await channel.send({
    embeds: [
      {
        title: 'Bump Reminder',
        description: 'Nobody has bumped the server yet! Use `/bump` to do so.',
        color: 0x2f6f7f,
      },
    ],
  });
}
