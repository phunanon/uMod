import { Feature } from '.';

export const InviteSpam: Feature = {
  async HandleMessage({ message, member, unmoddable, isDelete, channelFlags }) {
    if (unmoddable || isDelete || !channelFlags.antiSpam) return;

    const wordDiscord = new RegExp(
      /discord\.(gg|com)(?!\/channel|\/events|\/developers)/gi,
    ).test(message.content);
    const wordEveryone = message.content.includes('@everyone');
    if (!wordDiscord && !wordEveryone) return;

    await message.delete();

    const guild = message.guild?.name ?? 'the server';

    if (wordEveryone !== wordDiscord) {
      const reason = wordEveryone
        ? 'Attempted to ping everyone'
        : 'Attempted to post Discord invite';
      await member.timeout(1000 * 60 * 5, reason);
      return;
    }

    const dmed = await (async () => {
      try {
        const channel = await member.createDM();
        await channel?.send(
          `You were automatically kicked from ${guild} for posting an invite link and pinging everyone.
If you suspect your account was hacked:
- Change your password
- Log out of all devices from settings
- Log back in again
You're welcome to rejoin the server again after you've fixed your account.`,
        );
        return true;
      } catch (e) {
        return false;
      }
    })();
    await member.kick(
      'Discord invite link + @everyone spam' +
        (dmed ? ' (informed via DMs why)' : ''),
    );

    return 'stop';
  },
};
