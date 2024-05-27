# μMod

Simple moderation bot so I can kick Carlbot.

- **PermaRole**: ensures roles are restored even if somebody leaves and joins
- **KickInviteSpam**: kicks users who post invites and ping @everyone
- **Leaderboard**: keeps track of user messages and ranks them
- **MirrorGuild**: mirrors messages from entire guild into one channel
- **Ping**: replies with "Pong!"
- **WhitelistChannel**: disables moderation for a channel
- **StickyMessage**: periodically resends a message to a channel
- **Echo**: repeats a message in a channel, anonymously
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

Aspirations:
- Different global-chat channels (e.g. tech and math)
- Auto-timeout for sharing any invite link
- Ticket system

## To host it yourself

I recommend using Bun. Then, in the terminal:

```
npm i -g pm2                       # Keeps the bot running even if it crashes
npm ci                             # Installs exact dependencies
npx prisma generate                # Generates Prisma client
npx prisma migrate dev             # Migrates the database
pm2 start out/index.js --name uMod # Starts up the bot
```
