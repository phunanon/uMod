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
import { GlobalChat } from './GlobalChat';
import { ActivitySort } from './ActivitySort';
import { Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts } from './Alert';
import { Note, ReadNote } from './Note';
import { ChannelBan } from './ChannelBan';
import { Censor, DeleteCensor } from './Censor';
import { BlockGifs } from './BlockGifs';
import { CreateTicket, TicketAdd, TicketsHere, CloseTicket } from './Ticket';
import { RoleList, RoleListAddRole, RoleListRemoveRole } from './RoleList';
import { SingleMessage, DeleteSingleMessage } from './SingleMessage';

export const features = {
  ...{ PermaRole, InviteSpam, Ping, WhitelistChannel, MirrorGuild },
  ...{ Leaderboard, StickyMessage, Purge, GlobalChat, ActivitySort },
  ...{ Confess, ConfessMute, Note, ReadNote, ChannelBan, Censor, DeleteCensor },
  ...{ Alert, DeleteAlert, DeleteAlerts, RecommendedAlerts, BlockGifs },
  ...{ CreateTicket, TicketAdd, TicketsHere, CloseTicket },
  ...{ RoleList, RoleListAddRole, RoleListRemoveRole },
  ...{ SingleMessage, DeleteSingleMessage },
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
};

export type MessageContext = {
  message: Message;
  guildSf: bigint;
  channelSf: bigint;
  userSf: bigint;
  channel: TextChannel;
  isEdit: boolean;
};

export type AuditEvent = {
  kind: 'ban' | 'unban' | 'kick' | 'timeout';
  target: User | null;
  executor: User | null;
  reason: string;
};

export type Feature = {
  /** Call is guaranteed but not necessarily prior to other handlers. */
  Init?: (commands: ApplicationCommandManager) => Promise<void>;
  HandleMessage?: (context: MessageContext) => Promise<void | 'stop'>;
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
};
