import { PrismaClient } from '@prisma/client';
import {
  Client,
  GatewayIntentBits,
  IntentsBitField,
  Partials,
} from 'discord.js';

export const prisma = new PrismaClient();

export const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message],
  closeTimeout: 6_000,
});

export const log = (...args: any[]) =>
  console.log(new Date().toLocaleTimeString(), ...args);
