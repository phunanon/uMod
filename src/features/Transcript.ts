import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from 'discord.js';
import { Feature, TextChannels } from '.';
import { isGoodChannel } from '../infrastructure';

type Job = {
  startedAt: Date;
  interaction: ChatInputCommandInteraction;
  channel: TextChannels;
  destination: TextChannels;
  before: string | null;
  messages: string[];
};
const jobs: Job[] = [];

const headers = 'Message ID,Author ID,Author,Content,Reference ID';
const csvCells = (...args: (string | undefined)[]) =>
  args
    .map(a => {
      const quoted = a?.includes(',') ? `"${a.replace(/"/g, '""')}"` : a ?? '';
      return quoted.replace(/\n/g, '\\n');
    })
    .join(',');

export const Transcript: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'transcript',
      description: 'Generate a transcript of the current channel.',
      options: [
        {
          name: 'destination',
          description: 'The channel to send the transcript to.',
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
      ],
    });
    setInterval(tick, 2_000);
  },
  Interaction: {
    name: 'transcript',
    moderatorOnly: true,
    async command({ interaction, guild, channel }) {
      await interaction.reply('(0 messages, 0.0s) Transcribing...');

      const dest = interaction.options.getChannel('destination', true);

      const destination = await guild.channels.fetch(dest.id);
      if (!isGoodChannel(destination)) {
        await interaction.editReply(
          'The destination channel must be a text channel.',
        );
        return;
      }

      jobs.push({
        startedAt: new Date(),
        interaction,
        channel,
        destination,
        messages: [],
        before: channel.lastMessageId,
      });
    },
  },
};

const tick = async () => {
  const job = jobs[Math.floor(jobs.length * Math.random())];
  if (!job) return;
  const { interaction, channel, messages, before } = job;

  const batch = await channel.messages.fetch({
    limit: 100,
    before: before ?? undefined,
  });

  messages.push(
    ...batch.map(({ id, author, content, attachments, reference }) => {
      const txt = [content, ...attachments.map(a => a.url)].join(' ');
      return csvCells(id, author.id, author.tag, txt, reference?.messageId);
    }),
  );
  job.before = batch.last()?.id ?? null;

  const dest = await (async () => {
    if (batch.size < 100) {
      messages.reverse();
      jobs.splice(jobs.indexOf(job), 1);
      const attachment = new AttachmentBuilder(
        Buffer.from(headers + '\n' + messages.join('\n'), 'utf-8'),
      ).setName(`${channel.name} transcript.csv`);
      const content = `Transcription of ${channel.url}`;
      return await job.destination.send({ content, files: [attachment] });
    }
  })();

  if (!dest && messages.length % 1000) return;

  const numMsg = messages.length.toLocaleString();
  const elapsedMs = new Date().getTime() - job.startedAt.getTime();
  const elapsed = (elapsedMs / 1000).toFixed(1);
  const stat = dest ? `Transcription complete: ${dest.url}` : 'Transcribing...';
  const content = `(${numMsg} messages, ${elapsed}s) ${stat}`;
  await interaction.editReply(content);
};
