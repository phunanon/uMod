import { PrismaClient } from '@prisma/client';
import { DMChannel, PartialDMChannel, PartialGroupDMChannel } from 'discord.js';
import { PrivateThreadChannel, TextBasedChannel } from 'discord.js';
import { Guild, Channel, ChannelType, Client, Message } from 'discord.js';
import { GatewayIntentBits, IntentsBitField, Partials } from 'discord.js';
import { MessageSnapshot, ApplicationCommandOptionType } from 'discord.js';
import { APIApplicationCommandOptionBase } from 'discord.js';

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

export type TextChannels = Exclude<
  TextBasedChannel,
  DMChannel | PartialDMChannel | PrivateThreadChannel | PartialGroupDMChannel
>;

export const isGoodChannel = (
  channel: Channel | null,
): channel is TextChannels =>
  !!channel?.isTextBased() &&
  channel.type !== ChannelType.DM &&
  channel.type !== ChannelType.PrivateThread;

export const sanitiseTag = (tag: string) =>
  tag.replace(new RegExp('([_*#])', 'g'), '\\$1');

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

export function quoteContent(message: Message | MessageSnapshot): string {
  const { url, content, reference, attachments, messageSnapshots } = message;
  const quoted = content
    .split('\n')
    .filter(x => !!x.trim())
    .map(x => `> ${x}`)
    .join('\n')
    .trim();
  const attachmentContent = attachments.map(x => x.url).join(' ');
  const refContent = (() => {
    const snapshot = messageSnapshots?.first();
    const snapshotContent = snapshot ? quoteContent(snapshot) : '';
    if (snapshotContent) return snapshotContent;
    return reference
      ? `https://discord.com/channels/${reference.guildId}/${reference.channelId}/${reference.messageId}`
      : '';
  })();
  const quotedRef = refContent ? `↪️ References:\n${refContent}` : '';
  const fallback = quotedRef || attachmentContent ? '' : '> [no text]';
  return `${quoted || fallback}
${url} ${attachmentContent} ${quotedRef}`.trim();
}

export function RoleIsAboveMe(roleId: string, guild: Guild) {
  const me = guild.members.me;
  if (!me) return true;
  const role = guild.roles.cache.get(roleId);
  if (!role) return true;
  return role.position >= me.roles.highest.position;
}

export function userOption(
  description: string,
  required = false,
): APIApplicationCommandOptionBase<ApplicationCommandOptionType.User> {
  return {
    name: 'user',
    description,
    type: ApplicationCommandOptionType.User,
    required,
  };
}
