import { ApplicationCommandOptionType } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const GuildMods: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'guild-mods',
      description:
        'Toggle which roles have the power to use µMod (except for this command).',
      options: [
        {
          name: 'role',
          description: 'The role to toggle.',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'guild-mods',
    moderatorOnly: true,
    async command({ interaction, guild, guildSf, userSf }) {
      await interaction.deferReply();

      if (userSf !== BigInt(guild.ownerId)) {
        await interaction.editReply({
          content: `Only <@${guild.ownerId}> can use this command.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      const role = interaction.options.getRole('role')?.id;
      if (!role) {
        await interaction.editReply('You must provide a role.');
        return;
      }
      const roleSf = BigInt(role);

      const existing = await prisma.guildMods.findUnique({
        where: { guildSf_roleSf: { guildSf, roleSf } },
      });

      if (existing) {
        await prisma.guildMods.delete({
          where: { guildSf_roleSf: { guildSf, roleSf } },
        });
        await interaction.editReply({
          content: `<@&${role}> no longer has power over µMod.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      await prisma.guildMods.create({ data: { guildSf, roleSf } });

      await interaction.editReply({
        content: `<@&${role}> now has power over µMod.`,
        allowedMentions: { parse: [] },
      });
    },
  },
};
