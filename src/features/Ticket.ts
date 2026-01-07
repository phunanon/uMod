import { ChannelType, PermissionsBitField } from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, TextInputBuilder } from 'discord.js';
import { ModalBuilder, ButtonStyle, TextInputStyle } from 'discord.js';
import { Feature } from '.';
import { prisma, TextChannels, userOption } from '../infrastructure';
import { MakeNote } from './Note';

export const TicketsHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'tickets-here',
      description: 'Put a message in the chat to create tickets here',
      options: [
        {
          name: 'message',
          description: 'The message to put in this chat',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'role',
          description: 'The role to include and ping',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'tickets-here',
    needPermit: 'ChannelConfig',
    async command({ interaction, channel }) {
      await interaction.deferReply({ ephemeral: true });

      const content = interaction.options.getString('message');
      const role = interaction.options.getRole('role');

      if (!content || !role) {
        await interaction.editReply('Invalid message or role.');
        return;
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`create_ticket_${role.id}`)
          .setLabel('New ticket')
          .setStyle(ButtonStyle.Primary),
      );

      await channel.send({ content, components: [row] });

      await interaction.editReply('Ticket message created.');
    },
  },
};

export const CreateTicket: Feature = {
  Interaction: {
    name: 'create_ticket_*',
    async button({ interaction, guild, channel, member }) {
      await interaction.deferReply({ ephemeral: true });

      const category = await channel.parent?.fetch();

      if (category?.type !== ChannelType.GuildCategory) {
        await interaction.editReply(
          'Error: must be within a channel category.',
        );
        return;
      }

      const role = interaction.customId.split('_')[2];
      if (!role) {
        await interaction.editReply('Error: invalid role.');
        return;
      }

      //Check if a channel already exists for the user, unless they're part of the role
      const prefix = `ticket-${interaction.user.id}`;
      const channels = await guild.channels.fetch();
      const existingChannels = channels.filter(c => c?.name.startsWith(prefix));
      const [firstChannel] = existingChannels.values();
      const hasPrivilegedRole = member.roles.cache.has(role);
      if (firstChannel && !hasPrivilegedRole) {
        await interaction.editReply(
          `You already have a ticket open: ${firstChannel.url}`,
        );
        return;
      }

      const newChannel = await guild.channels.create({
        name: prefix + `-${existingChannels.size}`,
        parent: category,
        permissionOverwrites: [
          {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: role,
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
        ],
      });

      await prisma.channelFlags.create({
        data: {
          channelSf: BigInt(newChannel.id),
          censor: false,
          antiSpam: false,
          blockGifs: true,
        },
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('staff_only')
          .setLabel('Staff only:')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`close_ticket_${role}`)
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger),
      );
      if (!hasPrivilegedRole) {
        const noteCount = await prisma.note.count({
          where: {
            guildSf: BigInt(guild.id),
            userSf: BigInt(interaction.user.id),
          },
        });
        if (noteCount) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`read-notes-${interaction.user.id}`)
              .setLabel(`Notes (${noteCount})`)
              .setStyle(ButtonStyle.Secondary),
          );
        }
      }

      await newChannel.send({ content: `<@&${role}>`, components: [row] });
      await newChannel.send(
        `<@${interaction.user.id}>, help us help you by now explaining why you opened this ticket.`,
      );

      await interaction.editReply(`Ticket created: ${newChannel.url}`);
    },
  },
};

export const TicketAdd: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'ticket-add',
      description: 'Add a user to a ticket',
      options: [userOption('The user to add', true)],
    });
  },
  Interaction: {
    name: 'ticket-add',
    needPermit: true,
    async command({ interaction, channel }) {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser('user');
      if (!user) {
        await interaction.editReply('Invalid user.');
        return;
      }

      if (
        !channel.name.startsWith('ticket-') ||
        channel.type !== ChannelType.GuildText
      ) {
        await interaction.editReply('This is not a ticket channel.');
        return;
      }

      try {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true });
      } catch (e) {
        await interaction.editReply("Couldn't add user to ticket.");
        return;
      }

      await interaction.editReply(`Added <@${user.id}> to the ticket.`);

      setTimeout(async () => {
        await channel.send({
          content: `<@${user.id}> added by <@${interaction.user.id}>`,
          allowedMentions: { users: [user.id] },
        });
      }, 1000);
    },
  },
};

const ticketClosingDebounce = new Set<string>();
export const CloseTicket: Feature = {
  Interaction: {
    name: 'close_ticket_*',
    async button({ channel, interaction, member, userSf }) {
      const role = interaction.customId.split('_')[2];
      if (!role) {
        await interaction.reply({
          content: 'Error: invalid ticket.',
          ephemeral: true,
        });
        return;
      }
      if (!member.roles.cache.has(role)) {
        await interaction.reply({
          content: `Only <@&${role}> can close this ticket.`,
          ephemeral: true,
        });
        return;
      }

      const ticketMembers = getTicketMembers(channel, role, userSf);
      if (!ticketMembers.length) {
        await channel.delete();
        return;
      }

      if (!ticketClosingDebounce.has(channel.id)) {
        void channel.send({
          content: `<@${interaction.user.id}> is closing this ticket.`,
          allowedMentions: { parse: [] },
        });
        ticketClosingDebounce.add(channel.id);
        setTimeout(() => ticketClosingDebounce.delete(channel.id), 60_000);
      }

      const closureReason = new TextInputBuilder()
        .setLabel('Closure reason')
        .setCustomId('closure_reason')
        .setPlaceholder('Why is this ticket being closed?')
        .setMinLength(8)
        .setMaxLength(1000)
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph);
      const dmMembersPlural = ticketMembers.length === 1 ? '' : 's';
      const closureDm = new TextInputBuilder()
        .setLabel(`DM to ticket member${dmMembersPlural}`)
        .setCustomId('closure_dm')
        .setPlaceholder(
          'Optional DM sent either to the member who opened it and/or any manually added members.',
        )
        .setMinLength(8)
        .setMaxLength(1000)
        .setRequired(false)
        .setStyle(TextInputStyle.Paragraph);

      const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        closureReason,
      );
      const dmRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        closureDm,
      );
      const modal = new ModalBuilder()
        .setCustomId(`closure_reason_${role}`)
        .setTitle('Ticket debrief')
        .addComponents(reasonRow, dmRow);

      await interaction.showModal(modal);
    },
  },
};

export const TicketClosureReasonSubmit: Feature = {
  Interaction: {
    name: 'closure_reason_*',
    async modalSubmit({ guild, interaction, channel, guildSf, userSf }) {
      await interaction.deferUpdate();

      const role = interaction.customId.split('_')[2];
      const closureReason =
        interaction.fields.getTextInputValue('closure_reason');
      const closureDm = interaction.fields.getTextInputValue('closure_dm');
      const closureDmQuoted = closureDm.split('\n').join('\n> ');

      const ticketMembers = getTicketMembers(channel, role, userSf);

      const unableToDm = new Set<bigint>();
      for (const userId of ticketMembers) {
        const member = await guild.members.fetch(`${userId}`).catch(() => null);
        const dmProblem = await (async () => {
          if (!closureDm) return false;
          if (!member) return true;
          const guildIcon = guild.iconURL({ forceStatic: true });
          try {
            await member.send({
              embeds: [
                {
                  title: 'Ticket closure message from staff',
                  author: {
                    name: guild.name,
                    icon_url: guildIcon ? guildIcon : undefined,
                  },
                  description: `> ${closureDmQuoted}`,
                  footer: {
                    text: 'Please open a new ticket if you wish to discuss further.',
                  },
                },
              ],
            });
          } catch {
            return true;
          }
          return false;
        })();
        if (dmProblem) {
          unableToDm.add(userId);
          const note = `attempted ticket closure: ${closureReason}\nDM: ${closureDm}`;
          await MakeNote(guildSf, userId, userSf, note);
          continue;
        }
        const closureDmNote = closureDm ? `\nDM: ${closureDm}` : '';
        const note = `closed ticket: ${closureReason}${closureDmNote}`;
        await MakeNote(guildSf, userId, userSf, note);
      }

      if (unableToDm.size) {
        for (const userId of unableToDm) {
          await channel.send(
            `<@${userId}>, I was unable to DM you with this:\n> ${closureDmQuoted}`,
          );
        }
      } else {
        await channel.delete();
      }
    },
  },
};

const getTicketMembers = (
  channel: TextChannels,
  excludeRoleSf?: string,
  excludeUserSf?: bigint,
) => {
  if (channel.type !== ChannelType.GuildText) return [];
  const ticketSnowflake = channel.name.split('-')[1];
  const users = channel.permissionOverwrites.cache
    .filter(po => po.allow.has(PermissionsBitField.Flags.ViewChannel))
    .filter(po => po.id !== excludeRoleSf)
    .map(po => BigInt(po.id))
    .concat(ticketSnowflake ? [BigInt(ticketSnowflake)] : [])
    .filter(id => id !== excludeUserSf);
  const membersNotExcludedByRole = new Set<bigint>();
  for (const userId of users) {
    const member = channel.guild.members.cache.get(`${userId}`);
    if (!member || !member.roles.cache.has(excludeRoleSf || '')) {
      membersNotExcludedByRole.add(userId);
    }
  }
  return [...membersNotExcludedByRole];
};
