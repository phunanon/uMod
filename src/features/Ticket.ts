import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from 'discord.js';
import { Feature } from '.';

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
    async button({ interaction, channel }) {
      await interaction.deferReply({ ephemeral: true });

      const category = await channel.parent?.fetch();

      if (!category) {
        await interaction.editReply(
          'Error: must be within a channel category.',
        );
        return;
      }

      const guild = await interaction.guild?.fetch();
      if (!guild) {
        await interaction.editReply('Error: could not fetch guild.');
        return;
      }
      const role = interaction.customId.split('_')[2];
      if (!role) {
        await interaction.editReply('Error: invalid role.');
        return;
      }

      //Check if a channel already exists for the user
      const name = `ticket-${interaction.user.id}`;
      const channels = await guild.channels.fetch();
      const userChannel = channels.find(c => c?.name === name);
      if (userChannel) {
        await interaction.editReply(
          `You already have a ticket open: ${userChannel.url}`,
        );
        return;
      }

      const newChannel = await guild.channels.create({
        name,
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

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close ticket')
          .setStyle(ButtonStyle.Danger),
      );

      await newChannel.send({
        content: `<@&${role}>`,
        embeds: [
          {
            title: 'Ticket created',
            description: `Ticket created by <@${interaction.user.id}>`,
          },
        ],
        components: [row],
      });

      await interaction.editReply('Ticket created.');
    },
  },
};

export const CloseTicket: Feature = {
  Interaction: {
    name: 'close_ticket',
    moderatorOnly: false,
    async button({ interaction, channel }) {
      await interaction.deferReply({ ephemeral: true });
      await channel.delete();
    },
  },
};
