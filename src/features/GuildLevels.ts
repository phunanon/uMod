import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import { Feature } from '.';
import { client, prisma } from '../infrastructure';

const latestLevels = new Map<`${bigint}-${bigint}`, number>();

export const GuildLevels: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'enable-guild-levels',
      description: 'Enable or disable the guild levels feature',
      options: [
        {
          name: 'function',
          description:
            'What mathematical function to use for calculating level',
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: 'messages / 100', value: 'linear100' },
            { name: 'messages / 1000', value: 'linear1000' },
            { name: 'sqrt(messages / 5)', value: 'sqrt/5' },
            { name: 'log2(messages) - 2', value: 'log2-2' },
          ],
          required: true,
        },
        {
          name: 'channel',
          description:
            'Where level-up messages are sent, else they will be in-situ',
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: false,
        },
      ],
    });
  },
  Interaction: {
    name: 'enable-guild-levels',
    needPermit: 'ServerConfig',
    command: async ({ interaction, guildSf }) => {
      await interaction.deferReply();
      const functionName = interaction.options.getString('function', true);
      const channel = interaction.options.getChannel('channel');

      const existingConfig = await prisma.guildLevel.findFirst({
        where: { guildSf },
      });

      if (existingConfig) {
        await prisma.guildLevel.delete({
          where: { guildSf },
        });
        await interaction.editReply('Guild levels feature has been disabled.');
      } else {
        await prisma.guildLevel.create({
          data: {
            guildSf,
            channelSf: channel?.id ? BigInt(channel.id) : undefined,
            function: functionName,
          },
        });
        await interaction.editReply(
          `Guild levels feature has been enabled with function: ${functionName}. ${
            channel ? `Level-up messages will be sent to ${channel}.` : ''
          }`,
        );
      }
    },
  },
  async HandleMessageCreate({ message, guildSf, userSf, channelSf }) {
    const calculator = await GuildLevelCalculator(guildSf);
    if (calculator === null) return;
    const { f, congratsChannelSf } = calculator;

    const member = await prisma.member.findUnique({
      where: { userSf_guildSf: { userSf, guildSf } },
    });
    if (!member) return;

    const nextNumMessages = member.numMessages + 1;
    const fmtNextNumMessages = nextNumMessages.toLocaleString();
    const [currentLevel, nextLevel] = [
      f(member.numMessages),
      f(nextNumMessages),
    ];
    if (currentLevel === nextLevel) return;

    //Check we haven't just congratulated this user
    const key = `${guildSf}-${userSf}` as const;
    if (latestLevels.get(key) === nextLevel) return;
    latestLevels.set(key, nextLevel);

    if (congratsChannelSf && congratsChannelSf !== channelSf) {
      const channel = await client.channels.fetch(`${congratsChannelSf}`);
      if (!channel || !channel.isSendable()) {
        await prisma.guildLevel.delete({ where: { guildSf } });
        return;
      }
      await channel.send(
        `:tada: <@${userSf}>, you're now **level ${nextLevel}** after ${fmtNextNumMessages} messages!`,
      );
    }

    await message.reply(
      `:tada: you're now **level ${nextLevel}** after ${fmtNextNumMessages} messages!`,
    );
  },
};

type GuildLevelCalculatorReturn = {
  f: (numMessages: number) => number;
  congratsChannelSf: bigint | null;
};
export const GuildLevelCalculator = async (
  guildSf: bigint,
): Promise<GuildLevelCalculatorReturn | null> => {
  const guildLevelConfig = await prisma.guildLevel.findFirst({
    where: { guildSf },
  });
  if (!guildLevelConfig) return null;

  const { floor, sqrt, log2 } = Math;
  const functions: Record<string, (messages: number) => number> = {
    linear100: (messages: number) => messages / 100,
    linear1000: (messages: number) => messages / 1000,
    'sqrt/5': (messages: number) => sqrt(messages / 5),
    'log2-2': (messages: number) => Math.max(0, log2(messages) - 2),
  };
  const rawFunction = functions[guildLevelConfig.function];
  if (!rawFunction) {
    console.error(`Unknown level function ${guildLevelConfig}`);
    await prisma.guildLevel.delete({ where: { guildSf } });
    return null;
  }

  return {
    f: (numMessages: number) => floor(rawFunction(numMessages)),
    congratsChannelSf: guildLevelConfig.channelSf,
  };
};
