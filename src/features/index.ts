import {
  ApplicationCommandManager,
  ButtonInteraction,
  ChatInputCommandInteraction,
  DMChannel,
  Guild,
  GuildMember,
  Message,
  NonThreadGuildBasedChannel,
  PartialGuildMember,
  TextChannel,
  User,
} from 'discord.js';

import { PermaRole } from './PermaRole';
import { InviteSpam } from './InviteSpam';
import { Ping } from './Ping';
import { WhitelistChannel } from './WhitelistChannel';
import { MirrorGuild } from './MirrorGuild';
import { Leaderboard } from './Leaderboard';
import { StickyMessage } from './StickyMessage';
import { Confess, ConfessMute } from './Confess';
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
// import { MutualTimeout } from './MutualTimeout';
import { PingSpam } from './PingSpam';
import { PingProtect } from './PingProtect';

export const features = {
  ...{ PermaRole, InviteSpam, Ping, WhitelistChannel, MirrorGuild },
  ...{ Leaderboard, StickyMessage, Purge, ActivitySort },
  ...{ Confess, ConfessMute, Note, ReadNote, ChannelBan, Censor, DeleteCensor },
  ...{ Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts, BlockGifs },
  ...{ CreateTicket, TicketAdd, TicketsHere, CloseTicket },
  ...{ RoleList, RoleListAddRole, RoleListRemoveRole },
  ...{ SingleMessage, DeleteSingleMessage /* MutualTimeout */ },
  ...{ PingSpam, PingProtect, GlobalChat, GlobalChatList },
};

export type FeatureConfig = {
  commandName?: string;
  moderatorOnly?: boolean;
};

export type InteractionContext<T> = {
  interaction: T;
  guildSf: bigint;
  userSf: bigint;
  channelSf: bigint;
  channel: TextChannel;
  guild: Guild;
};

export type MsgCtx = {
  guild: Guild;
  channel: TextChannel;
  message: Message;
  guildSf: bigint;
  channelSf: bigint;
  userSf: bigint;
  isEdit: boolean;
  isDelete: boolean;
  isMod: boolean;
};
type NarrowMsgCtx = Omit<MsgCtx, 'isEdit' | 'isDelete'>;

export type AuditEvent = {
  kind: 'ban' | 'unban' | 'kick' | 'timeout';
  target: User | null;
  executor: User | null;
  reason: string;
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
          context: InteractionContext<ChatInputCommandInteraction>,
        ) => Promise<void>;
      }
    | {
        button: (
          context: InteractionContext<ButtonInteraction>,
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
  HandleAuditLog?: (entry: AuditEvent, guild: Guild) => Promise<void>;
  HandleChannelDelete?: (
    channel: DMChannel | NonThreadGuildBasedChannel,
  ) => Promise<void>;
} & (
  | { HandleMessage: (context: MsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageCreate: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageUpdate: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | { HandleMessageDelete: (context: NarrowMsgCtx) => Promise<void | 'stop'> }
  | {}
);
