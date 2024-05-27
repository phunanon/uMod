import { log } from '../infrastructure';
import { Feature } from '.';

export const InviteSpam: Feature = {
  async HandleMessage({ message }) {
    const wordDiscord = message.content.includes('discord.gg');
    const wordEveryone = message.content.includes('@everyone');
    if (!wordDiscord) return;

    await message.delete();
  
    const guild = message.guild?.name ?? 'the server';
    const member = message.member;
    if (!member) return;

    if (!wordEveryone) {
      await member.timeout(1000 * 60 * 5, 'Discord invite');
      return;
    }

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
    } catch (e) {
      log('InviteSpam', 'Failed to DM user', guild, e);
    }
    await member.kick('Discord invite link + @everyone spam');

    return 'stop';
  },
};
