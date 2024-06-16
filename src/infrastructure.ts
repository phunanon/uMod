import { PrismaClient } from '@prisma/client';
import {
  Channel,
  ChannelType,
  Client,
  GatewayIntentBits,
  IntentsBitField,
  Partials,
  TextChannel,
  VoiceChannel,
} from 'discord.js';

export const prisma = new PrismaClient();

export const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message],
  closeTimeout: 6_000,
});

export const log = (...args: any[]) =>
  console.log(new Date().toLocaleTimeString(), ...args);

export const isGoodChannel = (
  channel: Channel | null,
): channel is TextChannel | VoiceChannel =>
  channel?.type === ChannelType.GuildText ||
  channel?.type === ChannelType.GuildVoice;
