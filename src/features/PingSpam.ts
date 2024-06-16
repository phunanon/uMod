import { Feature } from '.';

export const PingSpam: Feature = {
  async HandleMessage({ message, member, isMod, isDelete }) {
    if (isMod || isDelete) return;
    if (message.mentions.users.size < 3) return;
    await member.timeout(60_000, 'Pinging more than two people in one message');
  },
};
