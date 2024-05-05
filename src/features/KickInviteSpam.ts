import { log } from '../infrastructure';
import { Feature, IsChannelWhitelisted } from '.';

export const KickInviteSpam: Feature = {
  async HandleMessageCreate(message) {
    if (await IsChannelWhitelisted(message.channel.id)) return;

    const wordDiscord = message.content.includes('discord');
    const wordEveryone = message.content.includes('@everyone');
    if (!wordDiscord || !wordEveryone) return;

    await message.delete();
    const guild = message.guild?.name ?? 'the server';
    const member = message.member;
    if (!member) return;
    try {
      await member.dmChannel?.send(
        `You were automatically kicked from ${guild} for spamming an invite link.
If you suspect your account was hacked:
- Change your password
- Log out of all devices from settings
- Log back in again
- Rejoin the server`,
      );
    } catch (e) {
      log('KickInviteSpam', 'Failed to DM user', guild, e);
    }
    await member.kick();
    log('KickInviteSpam', member.id, guild, message.content);
  },
};
