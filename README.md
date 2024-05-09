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
- **Alerts**: sends a message to a channel reacting to a specific event
  - Criteria: user ID, role ID, message pattern, event (join, leave, role assignment)
  - Optionally with a custom alert message with tokens: `$userId $content`
- (Planned) **Censor**: deletes messages with blacklisted words or phrases

## To host it yourself

I recommend using Bun. Then, in the terminal:

```
npm i -g pm2                       # Keeps the bot running even if it crashes
npm ci                             # Installs exact dependencies
npx prisma generate                # Generates Prisma client
npx prisma migrate dev             # Migrates the database
pm2 start out/index.js --name uMod # Starts up the bot
```
