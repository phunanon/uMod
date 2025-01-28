import { GuildMember, Message } from 'discord.js';
import { Feature } from '.';

enum Heuristic {
  /** (30sec) posting any message ten times */
  FastSpam = 'FastSpam',
  /** (30sec) sending a message that mentions anybody eight times */
  PingSpam = 'PingSpam',
  /** (30sec) posting a tall or long message three times */
  BigSpam = 'BigSpam',
  /** (5min) posting the same message to four different channels */
  ChannelSpam = 'ChannelSpam',
  /** (5min) posting the same link three times */
  SameLinkSpam = 'SameLinkSpam',
  /** (5min) posting the same message six times */
  SameMessageSpam = 'SameMessageSpam',
  /** (5min) posting a message with an attachment or link five times */
  MediaSpam = 'MediaSpam',
  /** (5min) reacting to messages ten times */
  ReactSpam = 'ReactSpam',
}

type CacheEntry = {
  at: Date;
  member: GuildMember;
  message: Message;
} & (
  | {
      kind: Heuristic.SameLinkSpam | Heuristic.SameMessageSpam;
      content: string;
    }
  | {
      kind: Heuristic.ChannelSpam;
      content: string;
      channelSf: bigint;
    }
  | {
      kind:
        | Heuristic.PingSpam
        | Heuristic.BigSpam
        | Heuristic.MediaSpam
        | Heuristic.FastSpam
        | Heuristic.ReactSpam;
    }
);
const heuristicTtl = {
  [Heuristic.FastSpam]: '30sec',
  [Heuristic.PingSpam]: '30sec',
  [Heuristic.BigSpam]: '30sec',
  [Heuristic.ChannelSpam]: '5min',
  [Heuristic.SameLinkSpam]: '5min',
  [Heuristic.SameMessageSpam]: '5min',
  [Heuristic.MediaSpam]: '5min',
  [Heuristic.ReactSpam]: '5min',
} as const;
const heuristicMax = {
  [Heuristic.FastSpam]: 10,
  [Heuristic.PingSpam]: 8,
  [Heuristic.BigSpam]: 3,
  [Heuristic.ChannelSpam]: 4,
  [Heuristic.SameLinkSpam]: 3,
  [Heuristic.SameMessageSpam]: 6,
  [Heuristic.MediaSpam]: 5,
  [Heuristic.ReactSpam]: 10,
} as const;
const ttlMs = { '30sec': 30_000, '5min': 5 * 60_000, '10min': 10 * 60_000 };
const cache: CacheEntry[] = [];
const warns = new Set<string>();
const makeWarning = (
  member: GuildMember,
  heuristic: Heuristic,
  content?: string,
) => `${member.guild.id}:${member.id}:${heuristic}:${content}`;

export const KickSus: Feature = {
  async HandleMessageCreate(ctx) {
    const { message, member, unmoddable, channelSf, channelFlags } = ctx;
    if (unmoddable || channelFlags?.antiSpam === false) return;
    //Record potentially suspicious activity
    const { content } = message;
    const hasMention = (message.mentions.members?.size ?? 0) > 0;
    const hasLink = message.content.includes('https://');
    const hasMedia = message.attachments.size > 0;
    const entry = { at: new Date(), member, message };
    cache.push({ ...entry, kind: Heuristic.FastSpam });
    cache.push({ ...entry, kind: Heuristic.ChannelSpam, content, channelSf });
    cache.push({ ...entry, kind: Heuristic.SameMessageSpam, content });
    if (hasMention) cache.push({ ...entry, kind: Heuristic.PingSpam });
    if (
      content.length > 200 ||
      content.split('\n').length > 4 ||
      content.match(/^#+ /m)
    )
      cache.push({ ...entry, kind: Heuristic.BigSpam });
    if (hasLink)
      cache.push({
        ...entry,
        kind: Heuristic.SameLinkSpam,
        content: message.content.match(/https?:\/\/\S+/)![0] ?? '',
      });
    if (hasMedia || hasLink)
      cache.push({ ...entry, kind: Heuristic.MediaSpam });
    //Revew the cache for this user
    await ReviewCache(member);
  },
  async HandleReactionAdd(reaction, user) {
    if (!reaction.message.guild) return;
    const message = reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message;
    const at = new Date();
    const member = await message.guild?.members.fetch(user.id);
    if (!member) return;
    cache.push({ at, member, message, kind: Heuristic.ReactSpam });
    //Revew the cache for this user
    await ReviewCache(member);
  },
};

async function ReviewCache(member: GuildMember) {
  //Purge old entries
  {
    const newCache: CacheEntry[] = [];
    const now = new Date().getTime();
    for (const entry of cache) {
      if (now - entry.at.getTime() < ttlMs[heuristicTtl[entry.kind]]) {
        newCache.push(entry);
      } else {
        const content = 'content' in entry ? entry.content : undefined;
        warns.delete(makeWarning(member, entry.kind, content));
      }
    }
    cache.splice(0, cache.length, ...newCache);
  }
  //Count suspicious activies per user
  const entries = cache.filter(entry => entry.member.id === member.id);
  type Count = { heuristic: Heuristic; content?: string; count: number };
  const counts: Count[] = [];
  for (const entry of entries) {
    //Handled separately
    if (entry.kind === Heuristic.ChannelSpam) continue;
    const existing = counts.find(
      c =>
        c.heuristic === entry.kind &&
        (!('content' in entry) || c.content === entry.content),
    );
    if (existing) existing.count++;
    else
      counts.push({
        heuristic: entry.kind,
        content: 'content' in entry ? entry.content : undefined,
        count: 1,
      });
  }
  //Handle ChannelSpam separately
  //Do counts based on number of channels affected, not number of entries
  {
    const channelSpamEntries = entries.filter(
      entry => entry.kind === Heuristic.ChannelSpam,
    );
    const byContent = channelSpamEntries.reduce((acc, entry) => {
      if (!acc[entry.content]) acc[entry.content] = new Set([entry.channelSf]);
      else acc[entry.content]!.add(entry.channelSf);
      return acc;
    }, {} as Record<string, Set<bigint>>);
    for (const [content, channels] of Object.entries(byContent)) {
      counts.push({
        heuristic: Heuristic.ChannelSpam,
        content,
        count: channels.size,
      });
    }
  }
  //Check if the user should be warned or kicked based on counts
  for (const { heuristic, content, count } of counts) {
    const maxCount = heuristicMax[heuristic];
    const entry = entries.findLast(entry => entry.kind === heuristic);
    if (!entry?.message.guild) continue;
    const ttl = heuristicTtl[heuristic];
    const why = `${heuristic}, ${maxCount} in ${ttl}`;
    //If one count away from a kick, warn the user by replying to the message
    const warning = makeWarning(member, heuristic, content);
    try {
      if (count === maxCount - 1 && !warns.has(warning)) {
        warns.add(warning);
        const independentOfMessage = heuristic === Heuristic.ReactSpam;
        const content =
          '**' +
          (independentOfMessage ? `<@${member.id}>, you` : 'You') +
          ` are one message away from being kicked** (${why}). Please slow down.`;
        const warningMessage =await entry.message.reply({
          content,
          allowedMentions: { users: [member.id.toString()] },
        });
        setTimeout(() => warningMessage.delete(), 300_000);
        await member.timeout(6_000, `Warning for ${why}`);
      }
      //If the user has reached the limit, kick them
      if (count >= maxCount) {
        await member.timeout(
          60_000 * 5,
          `To mitigate immediate rejoin and reoffence for ${why}`,
        );
        await member.kick(why + `, ${entry.message.url}`);
        //If the member had not been in the server for over an hour, delete all their messages
        const anHourAgo = Date.now() - 60 * 60_000;
        if (member.joinedAt && member.joinedAt.getTime() < anHourAgo) {
          const memberEntries = cache.filter(
            entry => entry.member.id === member.id,
          );
          const messages: Message[] = [];
          for (const entry of memberEntries)
            if (!messages.some(m => m.id === entry.message.id))
              messages.push(entry.message);
          for (const message of messages) {
            if (!message.guild) continue;
            await entry.message.delete();
            console.log('I deleted', message.id, message.content);
            await new Promise(resolve => setTimeout(resolve, 1_000));
          }
        }
      }
    } catch (e) {
      console.error(why, e);
    }
  }
}
