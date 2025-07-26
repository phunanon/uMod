import { Feature } from '.';

const start = new Date();

export const Ping: Feature = {
  async Init(commands) {
    await commands.create({ name: 'ping', description: 'Replies with pong!' });
  },
  Interaction: {
    name: 'ping',
    async command({ interaction }) {
      const ms = Date.now() - interaction.createdAt.getTime();
      const upSince = Math.floor(start.getTime() / 1000);
      await interaction.reply(`Pong! (${ms}ms)
- Up since: <t:${upSince}:R>`);
    },
  },
};
