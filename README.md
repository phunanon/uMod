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
- **JoinsLeaves**: logs user joins and leaves
- **GlobalChat**: mirrors messages between all opted-in guilds
- **Respond**: replies to messages with a specific content
- **ActivitySort**: sorts channels in a category by recent activity
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
