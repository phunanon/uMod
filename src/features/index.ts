import {
  ApplicationCommandManager,
  ChatInputCommandInteraction,
  GuildMember,
  Message,
  PartialGuildMember,
  TextChannel,
} from 'discord.js';

import { PermaRole } from './PermaRole';
import { KickInviteSpam } from './KickInviteSpam';
import { Ping } from './Ping';
import { WhitelistChannel } from './WhitelistChannel';
import { MirrorGuild } from './MirrorGuild';
import { Leaderboard } from './Leaderboard';
import { StickyMessage } from './StickyMessage';
import { Echo } from './Echo';
import { Purge } from './Purge';
import { GlobalChat } from './GlobalChat';
import { ActivitySort } from './ActivitySort';
import { Alert } from './Alert';
import { DeleteAlert } from './Alert';

export const features = {
  ...{ PermaRole, KickInviteSpam, Ping, WhitelistChannel, MirrorGuild },
  ...{ Leaderboard, StickyMessage, Echo, Purge, GlobalChat, ActivitySort },
  ...{ Alert, DeleteAlert },
};

export type FeatureConfig = {
  commandName?: string;
  moderatorOnly?: boolean;
};

export type InteractionContext = {
  interaction: ChatInputCommandInteraction;
  guildSf: bigint;
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

export type Feature = {
  /** Call is guaranteed but not necessarily prior to other handlers. */
  Init?: (commands: ApplicationCommandManager) => Promise<void>;
  HandleMessage?: (context: MessageContext) => Promise<void>;
  Interaction?: {
    commandName: string;
    moderatorOnly: boolean;
    handler: (context: InteractionContext) => Promise<void>;
  };
  HandleMemberUpdate?: (
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ) => Promise<void>;
  HandleMemberAdd?: (member: GuildMember) => Promise<void>;
  HandleMemberRemove?: (
    member: GuildMember | PartialGuildMember,
  ) => Promise<void>;
};
