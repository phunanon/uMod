import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  Guild,
  Message,
  TextBasedChannel,
} from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';

export const RoleList: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'role-list',
      description: 'Create a role list in this channel',
      options: [
        {
          name: 'role',
          description: 'The role monitored',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
        {
          name: 'addable',
          description: 'Whether the role is addable from the list',
          type: ApplicationCommandOptionType.Boolean,
        },
      ],
    });
  },
  Interaction: {
    name: 'role-list',
    moderatorOnly: true,
    async command({ interaction, channel, guildSf, channelSf }) {
      await interaction.deferReply({ ephemeral: true });

      const role = interaction.options.getRole('role');
      const addable = interaction.options.getBoolean('addable') ?? false;
      if (!role) {
        await interaction.editReply('Invalid role.');
        return;
      }

      const { guild } = interaction;
      if (!guild) {
        await interaction.editReply('Invalid guild.');
        return;
      }

      const where = { guildSf, roleSf: BigInt(role.id) };
      const existing = await prisma.roleList.findFirst({ where });

      if (existing) {
        await prisma.roleList.delete({ where: { id: existing.id } });
        await interaction.editReply('Role list disabled.');
        return;
      }

      const roleSf = BigInt(role.id);
      const message = await UpdateRoleList(roleSf, guild, { channel, addable });
      if (!message) {
        await interaction.editReply('Failed to create role list message.');
        return;
      }

      const messageSf = BigInt(message.id);
      await prisma.roleList.create({
        data: { guildSf, channelSf, roleSf, messageSf },
      });

      await interaction.editReply('Role list enabled.');
    },
  },
  async HandleMemberUpdate(oldMember, newMember) {
    if (oldMember.roles.cache.equals(newMember.roles.cache)) return;
    const guildSf = BigInt(newMember.guild.id);
    const delta = newMember.roles.cache.difference(oldMember.roles.cache);
    for (const { id } of delta.values()) {
      const roleSf = BigInt(id);
      const lists = await prisma.roleList.findMany({
        where: { guildSf, roleSf },
      });
      for (const { channelSf, messageSf } of lists) {
        const { guild } = newMember;
        const channel = await guild.channels.fetch(`${channelSf}`);
        if (!channel?.isTextBased()) continue;
        const message = await (async () => {
          try {
            return await channel.messages.fetch(`${messageSf}`);
          } catch (e) {
            await prisma.roleList.deleteMany({ where: { messageSf } });
          }
        })();
        if (!message) continue;
        await UpdateRoleList(roleSf, newMember.guild, { message });
      }
    }
  },
};

export const RoleListAddRole: Feature = {
  Interaction: {
    name: 'add-role-*',
    moderatorOnly: false,
    async button({ interaction, guild, member }) {
      await interaction.deferReply({ ephemeral: true });
      const roleSf = BigInt(interaction.customId.split('-').pop()!);
      const role = await guild.roles.fetch(`${roleSf}`);
      if (!role) return;
      await member.roles.add(role);
      await interaction.editReply(`You now have the <@&${role.id}> role.`);
    },
  },
};

export const RoleListRemoveRole: Feature = {
  Interaction: {
    name: 'remove-role-*',
    moderatorOnly: false,
    async button({ interaction, member }) {
      await interaction.deferReply({ ephemeral: true });
      const roleSf = BigInt(interaction.customId.split('-').pop()!);
      const guild = interaction.guild;
      if (!guild) return;
      const role = await guild.roles.fetch(`${roleSf}`);
      if (!role) return;
      await member.roles.remove(role);
      await interaction.editReply(
        `You no longer have the <@&${role.id}> role.`,
      );
    },
  },
};

const UpdateRoleList = async (
  roleSf: bigint,
  guild: Guild,
  mode: { message: Message } | { channel: TextBasedChannel; addable: boolean },
) => {
  const members = await guild.members.fetch();
  const withRole = members.filter(m => m.roles.cache.has(`${roleSf}`));
  const list = withRole.map(m => `\`${m.user.tag}\``).join(' ');
  const count = withRole.size;
  const payload: BaseMessageOptions = {
    content: `**${count} members with the role <@&${roleSf}>:**\n.\n${list}\n.`,
    allowedMentions: { parse: [] },
    components: [],
  };
  const makeAddRow = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`add-role-${roleSf}`)
        .setLabel('Give the role to me')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`remove-role-${roleSf}`)
        .setLabel('Take the role from me')
        .setStyle(ButtonStyle.Danger),
    );
  if ('message' in mode) {
    const newComponents = {
      components: mode.message.components.length
        ? [...(payload.components ?? []), makeAddRow()]
        : [],
    };
    return await mode.message.edit({ ...payload, ...newComponents });
  } else {
    const { channel, addable } = mode;
    const newComponents = {
      components: addable ? [...(payload.components ?? []), makeAddRow()] : [],
    };
    return await channel.send({ ...payload, ...newComponents });
  }
};
