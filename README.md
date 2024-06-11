# μMod

A moderation bot I made so I could kick Carlbot, but which now has now become quite featureful.

- Auto-Moderation
  - **InviteSpam**: auto-timeout users who post invites, and kick those who post invites and ping @everyone
  - **PingSpam**: auto-timeout users who ping more than one role or user in one message
  - **PermaRole**: ensures roles are restored even if somebody leaves and joins
  - **WhitelistChannel**: disables different kinds of auto-moderation for a channel
  - **SingleMessage**: enforces one message per user in a channel
  - **BlockGifs**: deletes messages with gifs from specified channels
  - **Censor**: deletes messages with blacklisted words or phrases and replaces them with a censored message
  - **PingProtect**: warn then timeout users who ping a user who has chosen to be protected
- Manual Moderation
  - **Tickets**: a ticket system for users to ask for help
    - Allows adding users to the ticket
  - **Note**: attaches notes to a user that all moderators can see
    - Notes are automatically attached for audit logs (ban, unban, kick, timeout, channel ban)
  - **MirrorGuild**: mirrors messages from entire guild into one channel
  - **Purge**: deletes a number of messages in a channel
  - **ChannelBan**: prevents a user from sending messages in a channel
  - **Alerts**: sends a message to a channel reacting to a specific event
    - Events: join, leave, role assignment, role restoration, moderation note, moderator action (ban, unban, kick, timeout, channel ban)
    - Criteria: user ID, role ID, message pattern
    - Optionally with a custom alert message with tokens: `$userId $content`
    - Also **DeleteAlert**, **DeleteAlerts**, and **RecommendedAlerts**
- Fun
  - **Leaderboard**: keeps track of user messages and ranks them
  - **Confess**: repeats a message in a channel, anonymously
    - Also **ConfessMute**
  - **GlobalChat**: mirrors messages between all opted-in guilds
- Useful
  - **Ping**: replies with "Pong!"
  - **StickyMessage**: periodically resends a message to a channel
  - **ActivitySort**: sorts channels in a category by recent activity
  - **RoleList**: maintains a message with a list of members with a role
  - **MutualTimeout**: allows anybody to mute another user but only if they are muted in return
    - Disabled in code by default

Aspirations:

- Different global-chat channels (e.g. tech and math)
- Auto-close ticket after a day of inactivity
- Confess IDs are unique per confession

## To host it yourself

Instructions for Node.js, in the terminal:

```
npm i -g pm2                       # Keeps the bot running even if it crashes
npm ci                             # Installs exact dependencies
npx prisma generate                # Generates Prisma client
npx prisma migrate dev             # Migrates the database
pm2 start out/index.js --name uMod # Starts up the bot
```

Though, you could probably instead use Bun.
