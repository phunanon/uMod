import { Feature } from '.';

export const PingSpam: Feature = {
  async HandleMessage({ message, member, unmoddable, isDelete }) {
    if (unmoddable || isDelete) return;
    const mentions = message.mentions.users.size;
    if (mentions < 4) return;
    const minutes = mentions ** 2;
    const ms = minutes * 60_000;
    await member.timeout(ms, `Pinging ${mentions} people in one message`);
    await message.reply(
      `**Timed out for ${minutes} minutes for pinging ${mentions} people at once**`,
    );
  },
};
