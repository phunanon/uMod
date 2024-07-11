import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const TicketsHere: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'tickets-here',
      description: 'Put a message in the chat to create tickets here',
      options: [
        {
          name: 'message',
          description: 'The message to put in the chat',
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
    moderatorOnly: true,
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
    moderatorOnly: false,
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
      if (firstChannel && !member.roles.cache.has(role)) {
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
        data: { channelSf: BigInt(newChannel.id), censor: false },
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`close_ticket_${role}`)
          .setLabel('Close ticket')
          .setStyle(ButtonStyle.Danger),
      );

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
    moderatorOnly: true,
    async command({ interaction, channel }) {
      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser('user');
      if (!user) {
        await interaction.editReply('Invalid user.');
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
    moderatorOnly: false,
    async button({ interaction, channel, member }) {
      await interaction.deferReply({ ephemeral: true });

      const role = interaction.customId.split('_')[2];
      if (!role) {
        await interaction.editReply('Error: invalid ticket.');
        return;
      }

      if (!member.roles.cache.has(role)) {
        await interaction.editReply(`Only <@&${role}> can close this ticket.`);
        return;
      }

      await channel.delete();
    },
  },
};
