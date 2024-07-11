import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  StringSelectMenuBuilder,
} from 'discord.js';
import { Feature } from '.';
import { prisma } from '../infrastructure';
import { AlertEvent, HandleAlert } from './Alert';

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
    moderatorOnly: true,
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
          await interaction.editReply('Rules must be 90 characters or less.');
          return;
        }
      }

      await prisma.guildRule.deleteMany({ where: { guildSf } });

      for (const rule of rules) {
        await prisma.guildRule.create({ data: { guildSf, rule } });
      }

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
    moderatorOnly: true,
    async contextMenu({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });
      const { author, content } = interaction.targetMessage;

      const rules = await prisma.guildRule.findMany({ where: { guildSf } });

      if (!rules.length) {
        await interaction.editReply(
          'No rules configured - use `/configure-rules`.',
        );
        return;
      }

      const options = rules
        .flatMap(({ id, rule }) => [
          { id, label: `(warning) ${rule}`, duration: 0 },
          { id, label: `(5min timeout) ${rule}`, duration: 5 * 60_000 },
          { id, label: `(60min timeout) ${rule}`, duration: 60 * 60_000 },
        ])
        .map(({ id, label, duration }) => ({
          ...{ label, value: `${id}-${author.id}-${duration}` },
        }));

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rule')
          .setPlaceholder('Select a rule')
          .addOptions(options),
      );

      try {
        await author.send(
          `A moderator is reviewing your message:\n> ${content}`,
        );
      } catch {
        await interaction.editReply('Could not DM the author.');
        return;
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
    moderatorOnly: true,
    async stringSelect({ interaction, guild, guildSf, userSf }) {
      await interaction.deferUpdate();

      const choice = interaction.values[0] ?? '';
      const [ruleIdStr, authorSfStr, durationStr] = choice.split('-');
      const ruleId = Number(ruleIdStr);
      const authorSf = BigInt(authorSfStr ?? '');
      const duration = Number(durationStr);
      if (!Number.isFinite(ruleId) || !authorSf || !Number.isFinite(duration)) {
        await interaction.editReply('Invalid choice.');
        return;
      }
      const minutes = duration / 60_000;

      const rule = await prisma.guildRule.findUnique({ where: { id: ruleId } });
      if (!rule) {
        await interaction.editReply('Rule not found.');
        return;
      }

      const member = await guild.members.fetch(`${authorSf}`);
      if (!member) {
        await interaction.editReply('Member not found.');
        return;
      }

      if (duration) {
        try {
          await member.timeout(
            duration,
            `Rule enforcement by <@${userSf}>: ${rule.rule}`,
          );
        } catch {
          await interaction.editReply('Could not timeout the author.');
          return;
        }
      } else {
        await prisma.note.create({
          data: {
            guildSf,
            authorSf: userSf,
            userSf: authorSf,
            content: `Warned for rule: ${rule.rule}`,
          },
        });
        await HandleAlert({
          event: AlertEvent.Note,
          userSf,
          guildSf,
          content: `<@${userSf}> warned for rule: ${rule.rule}`,
        });
      }

      try {
        await member.send(
          duration
            ? `You have been timed out for ${minutes} minutes for breaking the rule: **${rule.rule}**`
            : `You have been warned for breaking the rule: **${rule.rule}**`,
        );
      } catch {
        await interaction.editReply(
          'Could not DM the author. Please inform them yourself.',
        );
        return;
      }

      const didWhat = duration
        ? "timed out and DM'd about why"
        : 'warned via DMs';
      await interaction.editReply({
        content: `Rule enforced: ${rule.rule}\nMember ${didWhat}.`,
        components: [],
      });
    },
  },
};
