import {
  ApplicationCommandManager,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ClientEvents,
  DMChannel,
  Guild,
  GuildMember,
  Message,
  ModalSubmitInteraction,
  NonThreadGuildBasedChannel,
  PartialGuildMember,
  Typing,
  User,
  VoiceState,
  MessageContextMenuCommandInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import permits from './permits';
import { ChannelFlags } from '@prisma/client';
import { TextChannels } from '../infrastructure';

import { PermaRole } from './PermaRole';
import { InviteSpam } from './InviteSpam';
import { Ping } from './Ping';
import { WhitelistChannel } from './WhitelistChannel';
import { MirrorGuild } from './MirrorGuild';
import { LeaderboardRecorder } from './Leaderboard';
import { AgeLeaderboard, VcLeaderboard } from './Leaderboard';
import { Leaderboard, IqLeaderboard, LoyaltyLeaderboard } from './Leaderboard';
import { StickyMessage } from './StickyMessage';
import { Confess, ConfessMute, ConfessUnmute, ConfessSubmit } from './Confess';
import { ConfessionsHere } from './Confess';
import { Purge } from './Purge';
import { GlobalChat, GlobalChatList, GlobalChatMute } from './GlobalChat';
import { ActivitySort } from './ActivitySort';
import { Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts } from './Alert';
import { Note, ContextNote } from './Note';
import { ReadNotes, ReadNotesButton, ReadNotesByAuthor } from './Note';
import { ChannelBan, ChannelBanMessage } from './ChannelBan';
import { Censor, DeleteCensor } from './Censor';
import { BlockGifs } from './BlockGifs';
import { CreateTicket, TicketAdd, TicketsHere } from './Ticket';
import { CloseTicket, TicketClosureReasonSubmit } from './Ticket';
import { RoleList, RoleListAddRole, RoleListRemoveRole } from './RoleList';
import { PingSpam } from './PingSpam';
import { PingProtect } from './PingProtect';
import { Transcript } from './Transcript';
import { GuildPermit, GuildPermitList } from './GuildPermit';
import { Histogram } from './Histogram';
import { TempRole } from './TempRole';
import { Acquaintances } from './Acquaintances';
import { BumpReminder, SoftBumpReminder } from './BumpReminder';
import { BumpRemind, BumpUnremind } from './BumpReminder';
import { DisallowRole } from './DisallowRole';
import { GifMute } from './GifMute';
import { AutoRole } from './AutoRole';
import { QotdApprove, QotdDisable, QotdEnable, QotdSuggest } from './Qotd';
import { QotdSubscribe, QotdUnsubscribe, QotdReject } from './Qotd';
import { KickSus } from './KickSus';
import { EnforceRule, EnforceRulePicker } from './EnforceRule';
import { GentleReminder, GentleReminderPicker } from './EnforceRule';
import { ReadRules, SetupRule } from './EnforceRule';
import { DeleteMessage } from './DeleteMessage';
import { ChannelStats } from './ChannelStats';
import { TearGas } from './TearGas';
import { FakeUser } from './FakeUser';
import { SuspectedAlt } from './SuspectedAlt';
import { AiMod } from './AiMod';
import { AutoClean } from './AutoClean';
import { PresenceCheck } from './PresenceCheck';
import { Reminder } from './Reminder';
import { AutoHere } from './AutoHere';
import { GuildLevels } from './GuildLevels';
import { RoleFaucet, RoleFaucetButton } from './RoleFaucet';
import { IngestNotes } from './NoteIngestion';
import { KickWithDm } from './KickWithDm';

export const features = {
  ...{ MirrorGuild, BlockGifs, KickSus, AutoClean },
  ...{ PermaRole, InviteSpam, Ping, WhitelistChannel, ActivitySort },
  ...{ LeaderboardRecorder, Leaderboard, IqLeaderboard, LoyaltyLeaderboard },
  ...{ AgeLeaderboard, VcLeaderboard, StickyMessage, Purge, Transcript },
  ...{ Note, ReadNotes, ContextNote, ReadNotesByAuthor, ReadNotesButton },
  ...{ ChannelBan, ChannelBanMessage, Censor, DeleteCensor },
  ...{ Confess, ConfessMute, ConfessUnmute, ConfessSubmit, ConfessionsHere },
  ...{ Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts },
  ...{ CreateTicket, TicketAdd, TicketsHere },
  ...{ CloseTicket, TicketClosureReasonSubmit },
  ...{ RoleList, RoleListAddRole, RoleListRemoveRole },
  ...{ PingSpam, PingProtect, GlobalChat, GlobalChatList, GlobalChatMute },
  ...{ GuildPermit, GuildPermitList, Histogram, TempRole, Acquaintances },
  ...{ BumpReminder, SoftBumpReminder, BumpRemind, BumpUnremind },
  ...{ DisallowRole, GifMute, AutoRole, TearGas, SuspectedAlt },
  ...{ QotdApprove, QotdDisable, QotdEnable, QotdSuggest },
  ...{ QotdSubscribe, QotdUnsubscribe, QotdReject, ChannelStats, FakeUser },
  ...{ EnforceRule, EnforceRulePicker, GentleReminder, GentleReminderPicker },
  ...{ SetupRule, ReadRules, DeleteMessage, KickWithDm },
  ...{ AiMod, PresenceCheck, Reminder, AutoHere, GuildLevels },
  ...{ RoleFaucet, RoleFaucetButton, IngestNotes },
};
export const featurePermissions = new Set(
  Object.values(features).flatMap(f => {
    if (!f.Interaction) return [];
    const { name, needPermit } = f.Interaction;
    if (name === 'guild-permit') return [];
    if (typeof needPermit === 'string') return [needPermit];
    if (Array.isArray(needPermit)) return needPermit;
    if (needPermit) return [name];
    return [];
  }),
);

export type FeatureConfig = {
  commandName?: string;
  moderatorOnly?: boolean;
};

export type InteractionCtx<T> = {
  interaction: T;
  guildSf: bigint;
  userSf: bigint;
  channelSf: bigint;
  channel: TextChannels;
  channelFlags: ChannelFlags;
  guild: Guild;
  member: GuildMember;
};

export type MsgCtx = {
  guild: Guild;
  channel: TextChannels;
  channelFlags: ChannelFlags;
  message: Message;
  member: GuildMember;
  guildSf: bigint;
  channelSf: bigint;
  userSf: bigint;
  isEdit: boolean;
  isDelete: boolean;
  permissions: string[];
  unmoddable: boolean;
};
type NarrowMsgCtx = Omit<MsgCtx, 'isEdit' | 'isDelete'>;

export type AuditEvent =
  | {
      kind: 'ban' | 'unban' | 'kick' | 'timeout';
      target: User | null;
      executor: User | null;
      reason: string;
    }
  | {
      kind: 'untimeout';
      target: User | null;
      executor: User | null;
      reason: undefined;
    };

type Interaction = {
  /** Wildcard `*` can be put at the end */
  name: string;
  needPermit?: true | keyof typeof permits | (keyof typeof permits)[];
} & (
  | {
      command: (
        context: InteractionCtx<ChatInputCommandInteraction>,
      ) => Promise<void>;
    }
  | {
      button: (context: InteractionCtx<ButtonInteraction>) => Promise<void>;
    }
  | {
      modalSubmit: (
        context: InteractionCtx<ModalSubmitInteraction>,
      ) => Promise<void>;
    }
  | {
      contextMenu: (
        context: InteractionCtx<MessageContextMenuCommandInteraction>,
      ) => Promise<void>;
    }
  | {
      stringSelect: (
        context: InteractionCtx<StringSelectMenuInteraction>,
      ) => Promise<void>;
    }
);
export type Feature = {
  /** Call is guaranteed but not necessarily prior to other handlers. */
  Init?: (commands: ApplicationCommandManager) => Promise<void>;
  Interaction?: Interaction;
  HandleMemberUpdate?: (
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ) => Promise<void>;
  HandleMemberAdd?: (member: GuildMember) => Promise<void>;
  HandleMemberRemove?: (
    member: GuildMember | PartialGuildMember,
  ) => Promise<void>;
  HandleVoiceStateUpdate?: (
    oldState: VoiceState,
    newState: VoiceState,
  ) => Promise<void>;
  HandleTypingStart?: (typing: Typing) => Promise<void>;
  HandleAuditLog?: (entry: AuditEvent, guild: Guild) => Promise<void>;
  HandleChannelDelete?: (
    channel: DMChannel | NonThreadGuildBasedChannel,
  ) => Promise<void>;
  HandleReactionAdd?: (
    ...[{ message, emoji }, user]: ClientEvents['messageReactionAdd']
  ) => Promise<void>;
  HandleBotMessageCreate?: (
    context: Omit<MsgCtx, 'member'>,
  ) => Promise<void | 'stop'>;
} & (
  | { HandleMessage: (context: MsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageCreate: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageUpdate: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageDelete: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | {}
);
