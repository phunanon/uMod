import { ApplicationCommandOptionType } from 'discord.js';
import { ApplicationCommandOptionChoiceData } from 'discord.js';
import { Feature, featurePermissions } from '.';
import { prisma } from '../infrastructure';
import permits from './permits';

export const GuildPermit: Feature = {
  async Init(commands) {
    const permitNameMap = new Map(
      Object.entries(permits).map(([k, v]) => [k, { name: v, value: k }]),
    );
    const choices: ApplicationCommandOptionChoiceData<string>[] = [
      { name: 'All features (except this one)', value: 'all' },
      ...[...featurePermissions].map(
        p => permitNameMap.get(p) ?? { name: p, value: p },
      ),
    ];
    await commands.create({
      name: 'guild-permit',
      description:
        'Toggle which roles have the power to use µMod (except for this command).',
      options: [
        {
          name: 'role',
          description: 'The role to toggle.',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
        {
          name: 'permission',
          description: 'The permission to toggle.',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices,
        },
      ],
    });
  },
  Interaction: {
    name: 'guild-permit',
    needPermit: true,
    async command({ interaction, guild, guildSf, userSf }) {
      await interaction.deferReply();

      if (userSf !== BigInt(guild.ownerId)) {
        await interaction.editReply({
          content: `Only <@${guild.ownerId}> can use this command.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      const role = interaction.options.getRole('role', true)?.id;
      const permission = interaction.options.getString('permission', true);
      const permitSpiel = `has permission for: \`${permission}\``;
      const roleSf = BigInt(role);
      const guildSf_roleSf_permission = { guildSf, roleSf, permission };

      const existing = await prisma.guildPermission.findUnique({
        where: { guildSf_roleSf_permission },
      });

      if (existing) {
        await prisma.guildPermission.delete({
          where: { guildSf_roleSf_permission },
        });
        await interaction.editReply({
          content: `<@&${role}> no longer ${permitSpiel}.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      await prisma.guildPermission.create({ data: guildSf_roleSf_permission });

      await interaction.editReply({
        content: `<@&${role}> now ${permitSpiel}.`,
        allowedMentions: { parse: [] },
      });
    },
  },
};

export const GuildPermitList: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'guild-permit-list',
      description: 'List the roles with permissions.',
    });
  },
  Interaction: {
    name: 'guild-permit-list',
    async command({ interaction, guildSf }) {
      await interaction.deferReply();

      const where = { where: { guildSf } };

      const existing = await prisma.guildPermission.findMany(where);
      const byPermission = new Map<string, bigint[]>();
      for (const { roleSf, permission } of existing) {
        byPermission.set(permission, [
          ...(byPermission.get(permission) ?? []),
          roleSf,
        ]);
      }
      const maxLen = Math.max(...byPermission.keys().map(p => p.length));

      const content =
        '**Guild permissions**:\n' +
        [...byPermission.entries()]
          .map(([p, rs]) => {
            const roles = rs.map(r => `<@&${r}>`).join(', ');
            return `- \`${p.padEnd(maxLen, ' ')}\`: ${roles}`;
          })
          .join('\n');
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
    },
  },
};
