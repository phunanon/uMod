import { InteractionType } from 'discord.js';
import { Feature, ModeratorOnly } from '.';
import { prisma } from '../infrastructure';

export const WhitelistChannel: Feature = {
  async HandleInteractionCreate(interaction) {
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    if (interaction.commandName !== 'whitelist-channel') return;
    if (await ModeratorOnly(interaction)) return;

    const channel = interaction.options.get('channel', true).channel;

    if (!channel) {
      await interaction.reply('Invalid channel.');
      return;
    }

    const existing = await prisma.channelWhitelist.findFirst({
      where: { snowflake: BigInt(channel.id) },
    });
    if (existing) {
      await prisma.channelWhitelist.delete({ where: { id: existing.id } });
      await interaction.reply('Channel unwhitelisted.');
      return;
    }

    await prisma.channelWhitelist.create({
      data: { snowflake: BigInt(channel.id) },
    });

    await interaction.reply('Channel whitelisted.');
  },
};
