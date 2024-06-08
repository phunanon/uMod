# μMod

A moderation bot I made so I could kick Carlbot, but which now has now become quite featureful.

- **PermaRole**: ensures roles are restored even if somebody leaves and joins
- **InviteSpam**: auto-timeout users who post invites, and kick those who post invites and ping @everyone
- **Leaderboard**: keeps track of user messages and ranks them
- **Tickets**: a ticket system for users to ask for help
  - Allows adding users to the ticket
- **MirrorGuild**: mirrors messages from entire guild into one channel
- **Ping**: replies with "Pong!"
- **WhitelistChannel**: disables different kinds of moderation for a channel
- **StickyMessage**: periodically resends a message to a channel
- **Confess**: repeats a message in a channel, anonymously
- **Purge**: deletes a number of messages in a channel
- **GlobalChat**: mirrors messages between all opted-in guilds
- **ActivitySort**: sorts channels in a category by recent activity
- **ChannelBan**: prevents a user from sending messages in a channel
- **BlockGifs**: deletes messages with gifs from specified channels
- **Note**: attaches notes to a user that all moderators can see
  - Notes are automatically attached for audit logs (ban, unban, kick, timeout, channel ban)
- **Alerts**: sends a message to a channel reacting to a specific event
  - Criteria: user ID, role ID, message pattern
    - ... and events: join, leave, role assignment, role restoration, moderation note, moderator action (ban, unban, kick, timeout, channel ban)
  - Optionally with a custom alert message with tokens: `$userId $content`
  - Also **DeleteAlert**, **DeleteAlerts**, and **RecommendedAlerts**
- **Censor**: deletes messages with blacklisted words or phrases and replaces them with a censored message
- **RoleList**: maintains a message with a list of members with a role

Aspirations:

- Different global-chat channels (e.g. tech and math)
- Auto-close ticket after a day of inactivity
- Mute-for-mute

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
