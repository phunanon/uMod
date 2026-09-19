import {
  ApplicationCommandOptionType,
  ButtonStyle,
  ComponentType,
  Role,
} from 'discord.js';
import { Feature } from '.';
import { RoleIsAboveMe } from '../infrastructure';

export const RoleFaucet: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'role-faucet',
      description: 'Create a button in this channel to gain a role',
      options: [
        {
          type: ApplicationCommandOptionType.Role,
          name: 'role',
          description: 'The role to assign',
          required: true,
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'text',
          description: 'What the message should say',
          required: true,
          maxLength: 128,
        },
      ],
    });
  },
  Interaction: {
    name: 'role-faucet',
    needPermit: 'Roles',
    async command({ interaction, guild, channel }) {
      await interaction.deferReply({ ephemeral: true });
      const role = interaction.options.getRole('role', true);
      const text = interaction.options.getString('text', true);

      if (RoleIsAboveMe(role.id, guild)) {
        await interaction.editReply(
          'I would not be able to assign the role because it is above me.',
        );
        return;
      }

      await channel.send({
        content: text,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Success,
                label: `Get role`,
                customId: `role-faucet-${role.id}`,
              },
            ],
          },
        ],
      });

      await interaction.editReply('Role faucet created.');
    },
  },
};

export const RoleFaucetButton: Feature = {
  Interaction: {
    name: 'role-faucet-*',
    async button({ interaction, guild }) {
      await interaction.deferReply({ ephemeral: true });

      const roleId = interaction.customId.split('-')[2];
      const member = interaction.member;

      if (!roleId || RoleIsAboveMe(roleId, guild)) {
        await interaction.editReply(
          'I cannot assign the role because it is above me, or another issue.',
        );
        return;
      }

      if (!member || !('roles' in member)) {
        await interaction.editReply('Member not found');
        return;
      }

      try {
        const fetchedMember = await guild.members.fetch(member.user.id);
        const hasRole = fetchedMember.roles.cache.has(roleId);
        if (hasRole) {
          await fetchedMember.roles.remove(roleId);
          await interaction.editReply('Removed role.');
        } else {
          await fetchedMember.roles.add(roleId);
          await interaction.editReply('Added role.');
        }
      } catch (e) {
        await interaction.editReply('Operation failed');
      }
    },
  },
};
