import { PrismaClient } from '@prisma/client';
import { TextBasedChannel, TextChannel, VoiceChannel } from 'discord.js';
import { Channel, ChannelType, Client, Message } from 'discord.js';
import { GatewayIntentBits, IntentsBitField, Partials } from 'discord.js';

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

export const ParseDurationAsMs = (duration: string) => {
  const time = duration.match(/(\d+)([mhdwMy])/g);
  if (!time) return 'Invalid duration';
  const mss: Record<string, number> = {
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
    w: 7 * 24 * 60 * 60_000,
    M: 30 * 24 * 60 * 60_000,
    y: 365 * 24 * 60 * 60_000,
  };
  const ms = time.reduce(
    (acc, t) => acc + parseInt(t.slice(0, -1)) * (mss[t.slice(-1)] ?? 1),
    0,
  );
  if (!ms) return 'Invalid duration (0) - should be e.g. "1m 2h 3d 4w 5M 6y"';
  return ms;
};

export const R = (ms: number | Date) =>
  `<t:${Math.floor(new Date(ms).getTime() / 1000)}:R>`;

export function quoteContent({ id, url, ...message }: Message) {
  const { content, guildId, channelId, reference, attachments } = message;
  const textContent =
    content
      .split('\n')
      .filter(Boolean)
      .map(x => `> ${x}`)
      .join('\n')
      .trim() || '> [no text]';
  const attachmentContent = attachments.map(x => x.url).join('\n');
  const ref = reference
    ? `(replying to https://discord.com/channels/${guildId}/${channelId}/${id})`
    : '';
  return `${url}:
${textContent}
${attachmentContent}${attachmentContent ? '\n' : ''}${ref}`.trim();
}
