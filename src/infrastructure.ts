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
  ],
  partials: [Partials.Channel, Partials.Message],
});

export const log = (...args: any[]) =>
  console.log(new Date().toLocaleTimeString(), ...args);
