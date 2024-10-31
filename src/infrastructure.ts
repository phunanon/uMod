import { PrismaClient } from '@prisma/client';
import {
  Channel,
  ChannelType,
  Client,
  GatewayIntentBits,
  IntentsBitField,
  Partials,
  TextBasedChannel,
  TextChannel,
  VoiceChannel,
} from 'discord.js';

export const prisma = new PrismaClient();

export const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
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
  channel?.type === ChannelType.GuildVoice ||
  channel?.type === ChannelType.GuildAnnouncement;

export const sanitiseTag = (tag: string) =>
  tag.replace(new RegExp('([_*#])', 'g'), '\\$1');

export const TryFetchMessage = async (
  channel: TextBasedChannel,
  sf: bigint,
) => {
  try {
    return await channel.messages.fetch(`${sf}`);
  } catch {
    return null;
  }
};

export const TryFetchChannel = async (sf: bigint) => {
  try {
    return await client.channels.fetch(`${sf}`);
  } catch {
    return null;
  }
};

export const RecordRealAuthor = async (
  userSf: bigint,
  ...messageSfs: bigint[]
) => {
  await prisma.realAuthor.createMany({
    data: messageSfs.map(messageSf => ({ userSf, messageSf })),
  });
  //Delete realAuthor records older than a month
  await prisma.realAuthor.deleteMany({
    where: { at: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } },
  });
};
