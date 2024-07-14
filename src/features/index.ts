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
  TextChannel,
  Typing,
  User,
  VoiceChannel,
  VoiceState,
  MessageContextMenuCommandInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

import { PermaRole } from './PermaRole';
import { InviteSpam } from './InviteSpam';
import { Ping } from './Ping';
import { WhitelistChannel } from './WhitelistChannel';
import { MirrorGuild } from './MirrorGuild';
import {
  LeaderboardRecorder,
  Leaderboard,
  IqLeaderboard,
  LoyaltyLeaderboard,
} from './Leaderboard';
import { StickyMessage } from './StickyMessage';
import {
  Confess,
  ConfessMute,
  ConfessUnmute,
  ConfessSubmit,
  ConfessionsHere,
} from './Confess';
import { Purge } from './Purge';
import { GlobalChat, GlobalChatList } from './GlobalChat';
import { ActivitySort } from './ActivitySort';
import { Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts } from './Alert';
import { Note, ReadNote } from './Note';
import { ChannelBan } from './ChannelBan';
import { Censor, DeleteCensor } from './Censor';
import { BlockGifs } from './BlockGifs';
import { CreateTicket, TicketAdd, TicketsHere, CloseTicket } from './Ticket';
import { RoleList, RoleListAddRole, RoleListRemoveRole } from './RoleList';
import { SingleMessage, DeleteSingleMessage } from './SingleMessage';
import { PingSpam } from './PingSpam';
import { PingProtect } from './PingProtect';
import { Transcript } from './Transcript';
import { GuildMods } from './GuildMods';
import { Histogram } from './Histogram';
import { TempRole } from './TempRole';
import { Acquaintances } from './Acquaintances';
import { BumpReminder, BumpRemind, BumpUnremind } from './BumpReminder';
import { DisallowRole } from './DisallowRole';
import { GifMute } from './GifMute';
import { AutoRole } from './AutoRole';
import { QotdApprove, QotdDisable, QotdEnable, QotdSuggest } from './Qotd';
import { QotdSubscribe, QotdUnsubscribe } from './Qotd';
import { FakeUser } from './FakeUser';
import { KickSus } from './KickSus';
import { EnforceRule, EnforceRulePicker, SetupRule } from './EnforceRule';
import { DeleteMessage } from './DeleteMessage';

export const features = {
  ...{ MirrorGuild, KickSus },
  ...{ PermaRole, InviteSpam, Ping, WhitelistChannel, ActivitySort },
  ...{ LeaderboardRecorder, Leaderboard, IqLeaderboard, LoyaltyLeaderboard },
  ...{ StickyMessage, Purge, Transcript },
  ...{ Note, ReadNote, ChannelBan, Censor, DeleteCensor },
  ...{ Confess, ConfessMute, ConfessUnmute, ConfessSubmit, ConfessionsHere },
  ...{ Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts, BlockGifs },
  ...{ CreateTicket, TicketAdd, TicketsHere, CloseTicket },
  ...{ RoleList, RoleListAddRole, RoleListRemoveRole },
  ...{ SingleMessage, DeleteSingleMessage },
  ...{ PingSpam, PingProtect, GlobalChat, GlobalChatList },
  ...{ GuildMods, Histogram, TempRole, Acquaintances },
  ...{ BumpReminder, BumpRemind, BumpUnremind },
  ...{ DisallowRole, GifMute, AutoRole, FakeUser },
  ...{ QotdApprove, QotdDisable, QotdEnable, QotdSuggest },
  ...{ QotdSubscribe, QotdUnsubscribe },
  ...{ EnforceRule, EnforceRulePicker, SetupRule, DeleteMessage },
};

export type FeatureConfig = {
  commandName?: string;
  moderatorOnly?: boolean;
};

export type TextChannels = TextChannel | VoiceChannel;

export type InteractionCtx<T> = {
  interaction: T;
  guildSf: bigint;
  userSf: bigint;
  channelSf: bigint;
  channel: TextChannels;
  guild: Guild;
  member: GuildMember;
};

export type MsgCtx = {
  guild: Guild;
  channel: TextChannels;
  message: Message;
  member: GuildMember;
  guildSf: bigint;
  channelSf: bigint;
  userSf: bigint;
  isEdit: boolean;
  isDelete: boolean;
  isMod: boolean;
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

export type Feature = {
  /** Call is guaranteed but not necessarily prior to other handlers. */
  Init?: (commands: ApplicationCommandManager) => Promise<void>;
  Interaction?: {
    /** Wildcard `*` can be put at the end */
    name: string;
    moderatorOnly: boolean;
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
  HandleBotMessage?: (
    context: Omit<MsgCtx, 'member'>,
  ) => Promise<void | 'stop'>;
} & (
  | { HandleMessage: (context: MsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageCreate: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageUpdate: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageDelete: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | {}
);
