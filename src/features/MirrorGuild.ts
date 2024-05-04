import { ChannelType, Interaction, InteractionType, Message } from 'discord.js';
import { client, prisma } from '../infrastructure';
import { Feature, IsChannelWhitelisted, ModeratorOnly } from '.';

export const MirrorGuild: Feature = {
  async HandleMessageCreate(message: Message) {
    if (await IsChannelWhitelisted(message.channel.id)) return;
    const guildId = message.guild?.id;
    if (!guildId) return;

    const mirror = await prisma.guildMirror.findFirst({
      where: { guildSnowflake: BigInt(guildId) },
    });

    if (!mirror) return;

    const channel = await client.channels.fetch(`${mirror.channelSnowflake}`);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    if (channel.id === message.channel.id) return;

    const author = message.author;
    if (!author) return;

    const content = message.content;
    if (!content) return;

    const attachments = message.attachments;

    await channel.send({
      content: `(${author.id}) **${author.tag}**: ${content}`,
      files: attachments.map(attachment => attachment.url),
    });
  },
  async HandleInteractionCreate(interaction: Interaction) {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    if (interaction.commandName !== 'mirror-guild') return;
    if (await ModeratorOnly(interaction)) return;

    const guildId = interaction.guild?.id;
    if (!guildId) return;

    const channel = interaction.options.get('channel', true).channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply('Invalid channel.');
      return;
    }

    const existing = await prisma.guildMirror.findFirst({
      where: { guildSnowflake: BigInt(guildId) },
    });

    if (existing) {
      await prisma.guildMirror.delete({ where: { id: existing.id } });
      await interaction.reply('Mirror channel disabled.');
      return;
    }

    await prisma.guildMirror.create({
      data: {
        guildSnowflake: BigInt(guildId),
        channelSnowflake: BigInt(channel.id),
      },
    });

    await interaction.reply('Mirror channel enabled.');
  },
};
