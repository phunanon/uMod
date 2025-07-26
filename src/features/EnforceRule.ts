import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  EmbedBuilder,
  Message,
  StringSelectMenuBuilder,
} from 'discord.js';
import { Feature } from '.';
import { prisma, TryFetchMessage } from '../infrastructure';
import { DeleteMessageRow } from './DeleteMessage';
import { MakeNote } from './Note';

//TODO: support threads

export const SetupRule: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'configure-rules',
      description:
        'Configure rules for the server that can be selected from a dropdown menu.',
      options: [
        {
          name: 'rules',
          description: 'The rules, separated by ;;',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  },
  Interaction: {
    name: 'configure-rules',
    needPermit: 'ServerConfig',
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });

      const rulesText = interaction.options.getString('rules', true);
      const rules = rulesText.split(';;');
      if (rules.length > 25) {
        await interaction.editReply('Too many rules (25 max).');
        return;
      }

      for (const rule of rules) {
        if (rule.length > 90) {
          const truncated = rule.slice(0, 10);
          await interaction.editReply(
            `Each rule must be 90 characters or fewer ("${truncated}...")`,
          );
          return;
        }
      }

      await prisma.guildRule.deleteMany({ where: { guildSf } });

      await prisma.guildRule.createMany({
        data: rules.map(rule => ({ guildSf, rule })),
      });

      await interaction.editReply(`${rules.length} rule(s) configured.`);
    },
  },
};

export const EnforceRulePicker: Feature = {
  async Init(commands) {
    await commands.create({
      type: ApplicationCommandType.Message,
      name: 'Enforce rule',
    });
  },
  Interaction: {
    name: 'Enforce rule',
    needPermit: 'EnforceRule',
    async contextMenu({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });
      const { id: messageSf, author, content } = interaction.targetMessage;

      const rules = await prisma.guildRule.findMany({ where: { guildSf } });

      if (!rules.length) {
        await interaction.editReply(
          'No rules configured - use `/configure-rules`.',
        );
        return;
      }

      const options = [
        ...rules.map(({ id, rule }) => ({
          id,
          label: `(60min timeout) ${rule}`,
          duration: 60 * 60_000,
        })),
        ...rules.map(({ id, rule }) => ({
          id,
          label: `(warning) ${rule}`,
          duration: 0,
        })),
      ].map(({ id, label, duration }) => ({
        ...{ label, value: `${id}-${author.id}-${messageSf}-${duration}` },
      }));

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rule')
          .setPlaceholder('Select a rule')
          .addOptions(options),
      );

      try {
        const quotedContent = quoteContent(interaction.targetMessage);
        await author.send(
          `A moderator is reviewing your message ${quotedContent}`,
        );
      } catch {
        try {
          await interaction.targetMessage.reply(
            'A moderator is reviewing your message.',
          );
        } catch {}
      }

      await interaction.editReply({
        content: 'Select a rule to enforce',
        components: [row],
      });
    },
  },
};

export const EnforceRule: Feature = {
  Interaction: {
    name: 'rule',
    needPermit: 'EnforceRule',
    async stringSelect({ interaction, channel, guild, guildSf, userSf }) {
      await interaction.deferUpdate();

      const choice = interaction.values[0] ?? '';
      const [ruleIdStr, offenderSfStr, messageSfStr, durationStr] =
        choice.split('-');
      const ruleId = Number(ruleIdStr);
      const offenderSf = BigInt(offenderSfStr ?? '');
      const messageSf = BigInt(messageSfStr ?? '');
      const duration = Number(durationStr);
      if (
        !Number.isFinite(ruleId) ||
        !Number.isFinite(duration) ||
        !offenderSf ||
        !messageSf
      ) {
        await interaction.editReply('Invalid choice.');
        return;
      }
      const minutes = duration / 60_000;

      const rule = await prisma.guildRule.findUnique({ where: { id: ruleId } });
      if (!rule) {
        await interaction.editReply('Rule not found.');
        return;
      }

      const member = await guild.members.fetch(`${offenderSf}`);
      if (!member) {
        await interaction.editReply('Member not found.');
        return;
      }

      const message = await TryFetchMessage(channel, messageSf);
      const byline = ` by <@${userSf}>`;
      const content = quoteContent(message);
      const makeContent = (withByline: boolean) =>
        `Rule ${duration ? 'enforcement' : 'warning'}${
          withByline ? byline : ''
        }: ${rule.rule}\n${content}`;

      const timeoutProblem = await (async () => {
        if (!duration) return false;
        try {
          await member.timeout(duration, makeContent(true));
          return false;
        } catch {
          return true;
        }
      })();
      if (timeoutProblem || !duration) {
        const content = makeContent(false);
        await MakeNote(guildSf, offenderSf, userSf, content);
      }

      const dmProblem = await (async () => {
        try {
          await member.send(
            duration
              ? `You have been timed out for ${minutes} minutes for breaking the rule: **${rule.rule}**`
              : `You have been warned for breaking the rule: **${rule.rule}**`,
          );
        } catch {
          return true;
        }
        return false;
      })();

      const row = DeleteMessageRow(messageSf);

      const didWhat = duration
        ? "timed out and DM'd about why"
        : 'warned via DMs';
      const dmProblemSpiel = dmProblem
        ? 'Could not DM the author, but the warning has been logged. Please inform them yourself.'
        : '';
      const timeoutProblemSpiel = timeoutProblem
        ? 'Could not timeout the member. Seek help from a server admin if necessary.'
        : '';
      await interaction.editReply({
        content: `Rule enforced: ${rule.rule}\nMember ${didWhat}.\n${timeoutProblemSpiel}\n${dmProblemSpiel}`,
        components: [row],
      });
    },
  },
};

export const ReadRules: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'read-rules',
      description: 'Read the rules for this server',
    });
  },
  Interaction: {
    name: 'read-rules',
    async command({ interaction, guildSf }) {
      await interaction.deferReply();
      const rules = await prisma.guildRule.findMany({ where: { guildSf } });
      if (!rules.length) {
        await interaction.editReply(
          'No rules configured - use `/configure-rules`.',
        );
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('Some rules of the server')
        .setDescription(rules.map(r => `- ${r.rule}`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    },
  },
};

function quoteContent(message: Message | null): `${string}:\n${string}` {
  const textContent = message?.content
    .split('\n')
    .map(x => `> ${x}`)
    .join('\n');
  const attachmentContent = message?.attachments.map(x => x.url).join('\n');
  return `${message?.url ?? ''}:\n${textContent}\n${attachmentContent}`;
}
