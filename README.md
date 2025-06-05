# μMod

A moderation bot I made so I could kick Carlbot, but which now has now become quite featureful.

- Auto-Moderation
  - **AI Moderator**: an optional OpenAI-powered moderation feature that times out for five minutes after three strikes
  - **InviteSpam**: auto-timeout users who post invites, and kick those who post invites and ping @everyone
  - **PingSpam**: auto-timeout users who ping more than one role or user in one message
  - **PermaRole**: ensures roles are restored even if somebody leaves and joins
  - **WhitelistChannel**: disables different kinds of auto-moderation for a channel
  - **BlockGifs**: deletes messages with gifs from specified channels
  - **Censor**: deletes messages with blacklisted words or phrases and replaces them with a censored message
  - **PingProtect**: warn then timeout users who ping a user who has chosen to be protected
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
  - **Tickets**: a ticket system for users to ask for help
    - Allows adding users to the ticket
  - **Note**: attaches notes to a user that all moderators can see
    - Notes are automatically attached for audit logs (ban, unban, kick, timeout, channel ban)
  - **EnforceRule**: message context menu option to enforce your server rules as either a warning or 5/60min timeout
    - Up to 25 rules can be configured
    - Message author is informed that a moderator is reviewing their message, then they are informed of the outcome
  - **MirrorGuild**: mirrors messages from entire guild into one channel
  - **Purge**: deletes a number of messages in a channel
  - **ChannelBan**: prevents a user from sending messages in a channel
    - these are automatically restored if the user leaves and joins again
  - **Alerts**: sends a message to a channel reacting to a specific event
    - Events: join, leave, role assignment, role restoration, moderation note, moderator action (ban, unban, kick, timeout, channel ban), first message in server, join VC, leave VC, membership milestone
    - Criteria: user ID, role ID, message pattern
    - Optionally with a custom alert message with tokens: `$content, $url, $tag, $user, $ping`
    - Optionally with a cooldown
    - Also **DeleteAlert**, **DeleteAlerts**, and **RecommendedAlerts**
  - **GuildPermit**: assign granular permissions for using μMod's features
    - Only the guild owner can use this command
  - **TempRole**: assign a role to a user for a specified amount of time
  - **DisallowRole**: prevent a user from having a role
  - **TearGas**: temporarily enables slowmode in a channel
  - **SuspectedAlt**: an easier way to log suspected alt accounts
- Fun
  - **Leaderboard**: keeps track of users' number of messages and ranks them
    - **IqLeaderboard**: ranks users by their total number of distinct words per message divided by the number of message lines
    - **LoyaltyLeaderboard**: ranks users by the number of days between their earliest and latest activity
    - **AgeLeaderboard**: ranks users by their Discord account age
  - **GuildLevels**: uses a mathematical function of your choice to award people levels
  - **Confessions**: allows users to post anonymous messages in a channel
    - Also **ConfessMute** (preserving anonymity) and **ConfessUnmute**
  - **GlobalChat**: mirrors messages between guilds using public or private rooms
    - Includes message editing, deleting, and typing indication
  - **Histogram**: generates a histogram of hourly and week daily message counts for a user or the guild
  - **Acquaintances**: analyses the top three of who each user spends the most time talking to in chat
  - **QotD**: allows people to submit questions, moderators to approve them, and then sends one out daily
  - **FakeUser**: generates a message for a user that uses words and phrases they have previously said
- Useful
  - **AutoRole**: assigns a role to a user when they join
  - **Ping**: replies with "Pong!"
  - **StickyMessage**: periodically resends a message to a channel
  - **ActivitySort**: sorts channels in a category by recent activity
  - **RoleList**: maintains a message with a list of members with a role
  - **MutualTimeout**: allows anybody to mute another user but only if they are muted in return
    - Disabled in code by default
  - **Transcript**: sends a CSV transcript of a channel to a channel
  - **BumpReminder**: reminds users to bump on Disboard in a channel
  - **ChannelStats**: shows list of channels ordered by number of messages
  - **ReadRules**: lists the rules set up for a server
  - **Reminder**: users can create ping reminders for themselves
  - **AutoHere**: ping [@here](#) when somebody hadn't texted in a channel for one day

In order of priority, aspirations & TODO:

- different handler for registering slash commands which is only called via process.env
- don't punish for multiple reactions on same message
- caching and aggregation:
  - cache common database queries e.g. fetch member from database
  - collect feature database writes for the end of message processing
- level roles
- JoinLeaves table and logs
- refactor leaderboard SQL so that there's only one query including both the top ten and the current user
  - use typed SQL
- censor GlobalChat (might already be done)
- censor fake user
- ticket custom reasons and closure summaries
- EnforceRule suggestions (e.g. if they've already been warned in the past week, timeout instead)
- delete global messages that uMod deleted itself?
- keep track of record most users in vc
- vc leaderboard (minutes)

## To host it yourself

Instructions for Node.js, in the terminal:

```
npm i -g pm2                       # Keeps the bot running even if it crashes
npm ci                             # Installs exact dependencies
npx prisma migrate dev --name init # Migrates the database and generates client
pm2 start out/index.js --name uMod # Starts up the bot
```

Though, you could probably instead use [Bun](https://bun.sh/).
