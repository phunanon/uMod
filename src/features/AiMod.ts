import { Message, TextChannel } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';
import OpenAI from 'openai';

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
    moderatorOnly: true,
    async command({ interaction, channelSf, channelFlags }) {
      await interaction.deferReply();
      try {
        const aiModeration = !channelFlags?.aiModeration;
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;
  const openai = new OpenAI({ apiKey });
  const input: OpenAI.Moderations.ModerationMultiModalInput[] = [];
  if (message.content)
    input.push({
      type: 'text' as const,
      text: message.content.normalize('NFKD'),
    });
  const [attachment] = message.attachments.values();
  if (attachment)
    input.push({
      type: 'image_url' as const,
      image_url: { url: attachment.url },
    });

  const { results } = await openai.moderations.create({
    input,
    model: 'omni-moderation-latest',
  });
  const [result] = results;
  if (!result) {
    console.warn('No results returned from OpenAI');
    return;
  }

  const forgivenessSec = forgivenessMin * 60;
  const sec = Math.floor(Date.now() / 1000);
  while (strikes[0] && strikes[0].sec + forgivenessSec < sec) strikes.shift();

  const ignoredCategories = ['violence'];
  const resultCategories = Object.entries(result.categories)
    .filter(([k, v]) => !ignoredCategories.includes(k) && Boolean(v))
    .map(([k]) => k);

  if (!resultCategories.length) return;
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

  const scores = Object.entries(result.category_scores);
  const longestCategory = Math.max(...scores.map(([k]) => k.length));
  const report =
    '\n```' +
    scores
      .map(([k, v]) => `${k.padEnd(longestCategory, '.')} ${v.toFixed(5)}`)
      .join('\n') +
    '```';
  await (
    client.channels.fetch('1317181321293856828') as Promise<TextChannel>
  )?.then(async channel => await channel.send(message.content + report));
}

//Alcohol, gambling, drugs, sex, violence, illegal content, hate speech
//+there's evidence of taking offence
