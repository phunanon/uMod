import { InteractionType } from 'discord.js';
import { Feature } from '.';

export const Ping: Feature = {
  async HandleInteractionCreate(interaction) {
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    if (interaction.commandName !== 'ping') return;

    await interaction.reply('Pong!');
  },
};
