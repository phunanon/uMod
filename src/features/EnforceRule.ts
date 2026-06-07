import { ActionRowBuilder, Message, StringSelectMenuBuilder } from 'discord.js';
import { ApplicationCommandOptionType, EmbedBuilder } from 'discord.js';
import { ApplicationCommandType } from 'discord.js';
import { Feature } from '.';
import { prisma, quoteContent } from '../infrastructure';
import { DeleteMessageRow } from './DeleteMessage';
import { MakeNote, printNotes } from './Note';
import { Bad } from './AiMod';

//TODO: support threads
//TODO: rules themselves also need to be legally hardened

/** Sans ampersand */
const sa = (s: string) => (s.startsWith('&') ? s.slice(1).trim() : s);

export const SetupRule: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'configure-rules',
      description:
        'Configure rules for the server that can be selected from a dropdown menu.',
      options: [
        {
          name: 'rules',
          description:
            'Separate with ;; and prepended with & to additionally offer mute',
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
      const rules = rulesText
        .split(';;')
        .map(r => r.trim())
        .filter(r => r);
      const numMute = rules.filter(r => r.startsWith('&')).length;
      if (rules.length + numMute > 25) {
        await interaction.editReply(
          `Too many rules (including ${numMute} offered mutes, 25 max).`,
        );
        return;
      }

      await prisma.guildRule.deleteMany({ where: { guildSf } });

      await prisma.guildRule.createMany({
        data: rules.map(rule => ({ guildSf, rule })),
      });

      await interaction.editReply(
        `${rules.length} rule(s) configured (with ${numMute} offering mute).`,
      );
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
      const { id: messageSf, author } = interaction.targetMessage;
      if (author.bot) {
        await interaction.editReply('Cannot enforce rules on bots.');
        return;
      }

      const rules = await prisma.guildRule.findMany({ where: { guildSf } });

      if (!rules.length) {
        await interaction.editReply(
          'No rules configured - use `/configure-rules`.',
        );
        return;
      }

      const fmt = (r: string, prefix: string) => {
        const sanitised = prefix + r.replaceAll(/(\*\*)/g, '');
        return sanitised.length > 90
          ? `${sanitised.slice(0, 87)}...`
          : sanitised;
      };

      const options = [
        ...rules
          .filter(r => r.rule.startsWith('&'))
          .map(({ id, rule }) => ({
            id,
            label: fmt(sa(rule), '(60m mute) '),
            duration: 60 * 60_000,
          })),
        ...rules
          .map(({ id, rule }) => ({
            id,
            label: fmt(sa(rule), '(warn) '),
            duration: 0,
          })),
      ].map(({ id, label, duration }) => ({
        label,
        value: `${id}-${author.id}-${messageSf}-${duration}`,
      }));

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rule')
          .setPlaceholder('Select a rule')
          .addOptions(options),
      );

      const dmProblem = await (async () => {
        try {
          const raw = interaction.targetMessage.content;
          const quotedContent = (await Bad(raw))
            ? '[Message not quoted due to AI considering it inappropriate]'
            : quoteContent(interaction.targetMessage);
          await author.send(
            `A moderator is reviewing your message\n${quotedContent}`,
          );
        } catch {
          return true;
        }
      })();

      const notes = await prisma.note.findMany({
        where: { guildSf, userSf: BigInt(author.id) },
        orderBy: { notedAt: 'desc' },
        take: 3,
      });
      const sort = (a: (typeof notes)[0], b: (typeof notes)[0]) =>
        a.notedAt.getTime() - b.notedAt.getTime();
      const printedNotes = notes.length
        ? printNotes(notes.toSorted(sort))
        : '- No notes.';

      const dmProblemSpiel = dmProblem
        ? ':warning: I could not DM the author to inform them that their message is being reviewed. However, you can still issue a warning.\n'
        : '';
      await interaction.editReply({
        content:
          `${dmProblemSpiel}Select a rule to enforce. Last three notes:\n` +
          printedNotes,
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

      const member = await guild.members
        .fetch(`${offenderSf}`)
        .catch(() => null);
      if (!member) {
        await interaction.editReply('Member not found.');
        return;
      }

      const message = await channel.messages
        .fetch(`${messageSf}`)
        .catch(() => null);
      const byline = ` by <@${userSf}>`;
      const safelyQuoteContent = async (message: Message) => {
        const rawContent = message.content ?? '';
        if (!rawContent) return '[No content]';
        if (await Bad(rawContent)) {
          return '[Message content not quoted due to AI considering it inappropriate]';
        }
        return quoteContent(message);
      };
      const content = message
        ? await safelyQuoteContent(message)
        : '[unknown message]';
      const ruleText = sa(rule.rule);
      const makeContent = (withByline: boolean) =>
        `Rule ${duration ? 'enforcement' : 'warning'}${
          withByline ? byline : ''
        }: ${ruleText}\n${content}`;

      const muteProblem = await (async () => {
        if (!duration) return false;
        try {
          await member.timeout(duration, makeContent(true));
          return false;
        } catch {
          return true;
        }
      })();
      if (muteProblem || !duration) {
        const content = makeContent(false);
        await MakeNote(guildSf, offenderSf, userSf, content);
      }

      const dmProblem = await (async () => {
        try {
          await member.send(
            duration
              ? `You have been muted for ${minutes} minutes for breaking this rule:\n${ruleText}`
              : `You have been warned for breaking this rule:\n${ruleText}`,
          );
        } catch {
          return true;
        }
        return false;
      })();

      const row = DeleteMessageRow(messageSf);

      const dmSpiel = dmProblem
        ? ':warning: Could not DM the author, but the warning has been logged. Please inform them yourself.'
        : 'Member warned via DMs';
      const muteSpiel = muteProblem
        ? ':warning: Could not mute the member. Seek help from a server admin if necessary.'
        : "Member timed out and DM'd about why";
      const spiel = duration ? muteSpiel : dmSpiel;
      await interaction.editReply({
        content: `Rule enforced: ${rule.rule}\n${spiel}`,
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
        .setDescription(rules.map(r => `- ${sa(r.rule)}`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    },
  },
};

export const GentleReminderPicker: Feature = {
  async Init(commands) {
    await commands.create({
      name: 'gentle-reminder',
      description: 'Sends a gentle reminder of a rule in the channel.',
    });
  },
  Interaction: {
    name: 'gentle-reminder',
    needPermit: 'EnforceRule',
    async command({ interaction, guildSf }) {
      await interaction.deferReply({ ephemeral: true });
      const rules = await prisma.guildRule.findMany({ where: { guildSf } });
      if (!rules.length) {
        await interaction.editReply(
          'No rules configured - use `/configure-rules`.',
        );
        return;
      }

      const options = rules.map(r => ({ label: sa(r.rule), value: `${r.id}` }));
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('gentle-reminder-rule')
          .setPlaceholder('Select a rule to remind about')
          .addOptions(options),
      );

      await interaction.editReply({
        content: 'Select a rule to send a gentle reminder about:',
        components: [row],
      });
    },
  },
};

export const GentleReminder: Feature = {
  Interaction: {
    name: 'gentle-reminder-rule',
    needPermit: 'EnforceRule',
    async stringSelect({ interaction, channel, guild }) {
      await interaction.deferUpdate();

      const choice = interaction.values[0] ?? '';
      const ruleId = Number(choice);
      if (!Number.isFinite(ruleId)) {
        await interaction.editReply('Invalid choice.');
        return;
      }

      const rule = await prisma.guildRule.findUnique({ where: { id: ruleId } });
      if (!rule) {
        await interaction.editReply('Rule not found.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('Gentle Reminder')
        .setDescription(
          `Please be mindful of the following server rule:
- ${sa(rule.rule)}`,
        )
        .setColor(0x00ae86);

      await channel.send({ embeds: [embed] });

      await interaction.editReply({
        content: 'Gentle reminder sent.',
        components: [],
      });
    },
  },
};
