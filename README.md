# μMod - Legally Hardened.

A moderation bot I made so I could kick Carlbot, but which now has now become quite featureful.  

This branch is specifically for my personal use, whereby all publicly accessible features that could be mistaken for Indecent Publication under UK law are censored by AI, and others are left to be accessible only to me. Other features I don't make use of are also removed.

- Auto-Moderation
  - **AiMod**: an optional AI moderation feature that times out for five minutes after three strikes
    - uses local model for text
    - optionally uses free OpenAI model for images
  - **InviteSpam**: auto-timeout users who post invites, and kick those who post invites and ping @everyone
  - **PingSpam**: auto-timeout users who ping more than three roles or users in one message
  - **PermaRole**: ensures roles are restored even if somebody leaves and joins
  - **WhitelistChannel**: disables different kinds of auto-moderation for a channel
  - **BlockGifs**: deletes messages with gifs from specified channels
  - **Censor**: deletes messages with blacklisted words or phrases and replaces them with a censored message
  - **GifMute**: remove the ability to send gifs from messages of particular users
  - **KickSus**: a suite of heuristics that warns a user then kicks them if they continue
    - deletes all messages if they joined the server in the past hour
    - kicks the member if they joined in the past week
    - five minute timeout in any case
    - FastSpam - ten messages in 30 sec
    - PingSpam - eight mentions in 30 sec
    - BigSpam - three long or tall messages in 30 sec
    - ChannelSpam - four of the same message in different channels in 5 min
    - SameLinkSpam - three of the same link in 5 min
    - SameMessageSpam - six of the same message in 5 min
    - MediaSpam - five media messages in 5 min
    - TelegramSpam - two of the same t.me link in 1 hour
  - **AutoClean**: deletes messages with no content (e.g. wall of whitespace)
- Manual Moderation
  - **Tickets**: a ticket system for members to privately chat with a specified role
    - Allows adding members to the ticket
    - Requires a reason the ticket is being closed, for auditing
    - Optionally at closure allows a DM to be sent to the member summarising the ticket
  - **Note**: attaches notes to a user that all moderators can see
    - Notes are automatically attached for audit logs (ban, unban, kick, timeout, channel ban)
    - Arbitrary notes can be made with `/note`
    - Messages can be directly added to notes using the "Note this message" message context command
    - User notes can be read with `/notes`, and notes per staff with `/notes-by-author`
  - **EnforceRule**: message context menu option to enforce your server rules as either a warning or 5/60min timeout
    - Up to 25 rules can be configured
    - Message author is informed that a moderator is reviewing their message, then they are informed of the outcome
  - **GentleReminder**: anonymously drop a server rule reminder in a channel
  - **MirrorGuild**: mirrors messages from entire guild into one channel
  - **Purge**: deletes a number of messages in a channel
  - **ChannelBan**: prevents a member from sending messages in a channel
    - these are automatically restored if the user leaves and joins again
    - this can also be done from the message context menu, citing the message in notes
  - **Alerts**: sends a message to a channel reacting to a specific event
    - Events: join, leave, role assignment, role restoration, moderation note, moderator action (ban, unban, kick, timeout, channel ban), first message in server, join VC, leave VC, membership milestone
    - Criteria: user ID, role ID, message pattern
    - Optionally with a custom alert message with tokens: `$content, $url, $tag, $user, $ping`
    - Optionally with a cooldown
    - Also **DeleteAlert**, **DeleteAlerts**, and **RecommendedAlerts**
  - **GuildPermit**: assign granular permissions for using μMod's features
    - Only the guild owner can use this command
  - **TempRole**: assign a role to a member for a specified amount of time
  - **DisallowRole**: prevent a member from having a role
  - **TearGas**: temporarily enables slowmode in a channel
  - **SuspectedAlt**: an easier way to log suspected alt accounts
  - **KickWithDm**: sends a DM with a provided reason to a member before kicking them
- Fun
  - **Leaderboard**: keeps track of members' number of messages and ranks them; and also
    - **IqLeaderboard**: ranks members by their total number of distinct words per message divided by the number of message lines
    - **LoyaltyLeaderboard**: ranks members by the number of days between their earliest and latest activity
    - **AgeLeaderboard**: ranks members by their Discord account age
    - **VcLeaderboard**: ranks members by the number of minutes they've spent in any voice channel
  - **GuildLevels**: uses a mathematical function of your choice to award people levels
  - **Confessions**: allows members to post anonymous messages in a channel
    - Also **ConfessMute** (preserving anonymity) and **ConfessUnmute**
  - **GlobalChat**: mirrors messages between guilds using public or private rooms
    - Includes message editing, deleting, and typing indication
  - **Histogram**: generates a histogram of hourly and week daily message counts for a user or the guild
  - **Acquaintances**: analyses the top three of who each user spends the most time talking to in chat
  - **QotD**: allows people to submit questions, moderators to approve them, and then sends one out daily
- Useful
  - **AutoRole**: assigns a role to a user when they join
  - **Ping**: replies with "Pong!"
  - **StickyMessage**: periodically resends a message to a channel
  - **ActivitySort**: sorts channels in a category by recent activity
  - **Transcript**: sends a CSV transcript of a channel to a channel
  - **BumpReminder**: reminds members to bump on Disboard in a channel
  - **ChannelStats**: shows list of channels ordered by number of messages
  - **ReadRules**: lists the rules set up for a server
  - **Reminder**: users can create ping reminders for themselves
  - **IngestNotes**: use a channel to automatically ingest notes, either from regular members or bots

In order of priority, aspirations & TODO:

- limit all commands so they can't be used in DMs, using modern Discord.js API to do so
- central alert management, doing away with alert IDs
- paginated user notes
- private notes
- audit logs for staff actions (permit usages)
- reliably create member records during presence check
- different handler for registering slash commands which is only called via process.env
- caching and aggregation:
  - cache common database queries e.g. fetch member from database
  - collect feature database writes for the end of message processing
- level roles
- refactor leaderboard SQL so that there's only one query including both the top ten and the current user
  - use typed SQL
- delete global messages that uMod deleted itself?

## To host it yourself

Instructions for Node.js, in the terminal:

```bash
pnpm i -g pm2                      # Keeps the bot running even if it crashes
pnpm i                             # Installs exact dependencies
npx prisma migrate dev --name init # Migrates the database
npx prisma generate --sql          # Generates the client
pm2 start out/index.js --name uMod # Starts up the bot
```
