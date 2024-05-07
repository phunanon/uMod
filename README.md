# μMod

Simple moderation bot so I can kick Carlbot.

- PermaRole: ensures roles are restored even if somebody leaves and joins
- KickInviteSpam: kicks users who post invites and ping @everyone
- Leaderboard: keeps track of user messages and ranks them
- MirrorGuild: mirrors messages from entire guild into one channel
- Ping: replies with "Pong!"
- WhitelistChannel: disables moderation for a channel
- StickyMessage: periodically resends a message to a channel
- Echo: repeats a message in a channel, anonymously
- Purge: deletes a number of messages in a channel
- JoinsLeaves: logs user joins and leaves

```
npx prisma db push
```
