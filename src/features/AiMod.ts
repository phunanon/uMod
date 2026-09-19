import { Message } from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import OpenAI from 'openai';

type ToxicLabel = { label: string; score: number };

const toxicThreshold = 0.6;
let toxicClassifierPromise: Promise<
  (text: string) => Promise<ToxicLabel[]>
> | null = null;

async function ToxicClassifier() {
  if (!toxicClassifierPromise) {
    toxicClassifierPromise = (async () => {
      const { pipeline } = await import('@xenova/transformers');
      return (await pipeline('text-classification', 'Xenova/toxic-bert')) as (
        text: string,
      ) => Promise<ToxicLabel[]>;
    })();
  }
  return toxicClassifierPromise;
}

const forgivenessMin = 5;
const timeoutMin = 5;
const strikes: {
  userSf: bigint;
  sec: number;
  categories: Set<string>;
  messageSf: bigint;
}[] = [];

export const AiMod: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'ai-mod',
      description: 'Enable AI moderation in this channel',
    });
  },
  Interaction: {
    name: 'ai-mod',
    needPermit: 'LowDangerChannelConfig',
    async command({ interaction, channelSf, channelFlags }) {
      await interaction.deferReply();
      try {
        const globalChatOn = !!(await prisma.globalChat.findUnique({
          where: { channelSf },
        }));
        const aiModeration = !channelFlags?.aiModeration;
        if (globalChatOn && !aiModeration) {
          await interaction.editReply(
            'GlobalChat is on in this channel; cannot disable AI moderation.',
          );
          return;
        }
        await prisma.channelFlags.update({
          where: { channelSf },
          data: { aiModeration },
        });
        await interaction.editReply(
          `AI moderation ${
            aiModeration ? 'enabled' : 'disabled'
          } in this channel 🤖`,
        );
      } catch (e) {
        console.error('Error toggling AI moderation', e);
        await interaction.editReply(
          'There was an error enabling AI moderation',
        );
      }
    },
  },
  async HandleMessage(ctx) {
    const { userSf, message, channelFlags, isDelete } = ctx;
    if (!channelFlags.aiModeration || isDelete) return;
    await Moderate(userSf, message);
  },
};

async function Moderate(userSf: bigint, message: Message) {
  const input: OpenAI.Moderations.ModerationMultiModalInput[] = [];
  if (message.content)
    input.push({ type: 'text' as const, text: message.content });
  const [attachment] = message.attachments.values();
  if (attachment && !/\.mp4/.test(attachment.name))
    input.push({
      type: 'image_url' as const,
      image_url: { url: attachment.url },
    });

  const { ok, resultCategories } = await Categorise(input);
  if (ok || !resultCategories.length) return;

  const forgivenessSec = forgivenessMin * 60;
  const sec = Math.floor(Date.now() / 1000);
  while (strikes[0] && strikes[0].sec + forgivenessSec < sec) strikes.shift();

  const cats = resultCategories.join(', ');
  const categories = new Set(resultCategories);
  const messageSf = BigInt(message.id);
  const alreadyPunishedForMessage = strikes.some(
    x => x.messageSf === messageSf,
  );
  if (alreadyPunishedForMessage) return;
  strikes.push({ userSf, sec, categories, messageSf });
  const userStrikes = strikes.filter(x => x.userSf === userSf);

  if (userStrikes.length === 1) await message.react('😐');
  if (userStrikes.length === 2) await message.react('😡');
  if (userStrikes.length === 3) {
    await message.react('1232687199435100250');
    const member = await message.guild?.members.fetch(`${userSf}`);
    if (!member) return;
    const timeoutSec = timeoutMin * 60;
    await member.timeout(timeoutSec * 1_000, `${message.url} AI: ${cats}`);
    const s = resultCategories.length > 1 ? 's' : '';
    await message.reply(
      `**${timeoutMin} min timeout** due to three strikes in ${forgivenessMin} min (reason${s}: ${cats})`,
    );
    //Start with one strike after timeout ends
    userStrikes.push({ userSf, sec: sec + timeoutSec, categories, messageSf });
  }
}

async function Categorise(
  input: OpenAI.Moderations.ModerationMultiModalInput[],
) {
  const resultCategories = new Set<string>();
  const text = input
    .filter((i): i is { type: 'text'; text: string } => i.type === 'text')
    .map(i => i.text.normalize('NFKD'))
    .join('\n');

  if (text) {
    try {
      const classify = await ToxicClassifier();
      const labels = await classify(text);
      const toxicScore =
        labels.find(entry => entry.label.toLowerCase() === 'toxic')?.score ?? 0;
      if (toxicScore >= toxicThreshold) resultCategories.add('toxic');
    } catch (e) {
      console.error('Text moderation failed', e);
    }
  }

  const imageInput = input.filter(i => i.type === 'image_url');
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && imageInput.length) {
    try {
      const openai = new OpenAI({ apiKey });
      const { results } = await openai.moderations.create({
        input: imageInput,
        model: 'omni-moderation-latest',
      });
      const [result] = results;
      if (result) {
        Object.entries(result.categories)
          .filter(([, flagged]) => Boolean(flagged))
          .forEach(([category]) => resultCategories.add(category));
      } else {
        console.warn('No results returned from OpenAI');
      }
    } catch (e) {
      console.error('Image moderation failed', e);
    }
  }

  const categories = [...resultCategories];
  return { ok: !categories.length, resultCategories: categories };
}

export const Bad = async (text: string) =>
  await Categorise([{ type: 'text', text }]).then(r => !r.ok);
