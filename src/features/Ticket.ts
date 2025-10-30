import { ApplicationCommandOptionType, PermissionsBitField } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, TextInputBuilder } from 'discord.js';
import { ModalBuilder, ButtonStyle, TextInputStyle } from 'discord.js';
import { Feature, TextChannels } from '.';
import { prisma } from '../infrastructure';
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

      if (!category) {
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
          .setCustomId(`close_ticket_${role}`)
          .setLabel('Close ticket')
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
              .setLabel(`Read notes (${noteCount})`)
              .setStyle(ButtonStyle.Secondary),
          );
        }
      }

      await newChannel.send({
        content: `<@&${role}> <@${interaction.user.id}>`,
        components: [row],
      });

      await interaction.editReply(`Ticket created: ${newChannel.url}`);
    },
  },
};

export const TicketAdd: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'ticket-add',
      description: 'Add a user to a ticket',
      options: [
        {
          name: 'user',
          description: 'The user to add',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
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

      if (!channel.name.startsWith('ticket-')) {
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

      const field = new TextInputBuilder()
        .setLabel('Closure reason')
        .setCustomId('closure_reason')
        .setPlaceholder('Why is this ticket being closed?')
        .setMinLength(8)
        .setMaxLength(1000)
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph);
      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(field);
      const modal = new ModalBuilder()
        .setCustomId(`closure_reason_${role}`)
        .setTitle('Ticket debrief')
        .addComponents(row);

      const ticketUsers = getTicketUsers(channel, role, userSf);
      if (!ticketUsers.length) {
        await channel.delete();
        return;
      }

      await interaction.showModal(modal);
    },
  },
};

export const TicketClosureReasonSubmit: Feature = {
  Interaction: {
    name: 'closure_reason_*',
    async modalSubmit({ interaction, channel, guildSf, userSf }) {
      await interaction.deferUpdate();

      const role = interaction.customId.split('_')[2];
      const closureReason =
        interaction.fields.getTextInputValue('closure_reason');
      const note = `closed ticket: ${closureReason}`;

      const ticketUsers = getTicketUsers(channel, role, userSf);

      for (const userId of ticketUsers)
        await MakeNote(guildSf, userId, userSf, note);

      await channel.delete();
    },
  },
};

const getTicketUsers = (
  channel: TextChannels,
  excludeRoleSf?: string,
  excludeUserSf?: bigint,
) => {
  const ticketSnowflake = channel.name.split('-')[1];
  const users = channel.permissionOverwrites.cache
    .filter(po => po.allow.has(PermissionsBitField.Flags.ViewChannel))
    .filter(po => po.id !== excludeRoleSf)
    .map(po => BigInt(po.id))
    .concat(ticketSnowflake ? [BigInt(ticketSnowflake)] : [])
    .filter(id => id !== excludeUserSf);
  return [...new Set(users)];
};
