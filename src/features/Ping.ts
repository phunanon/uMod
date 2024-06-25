import { Feature } from '.';

export const Ping: Feature = {
  async Init(commands) {
    await commands.create({ name: 'ping', description: 'Replies with pong!' });
  },
  Interaction: {
    name: 'ping',
    moderatorOnly: false,
    async command({ interaction }) {
      const ms = Date.now() - interaction.createdAt.getTime();
      await interaction.reply(`Pong! (${ms}ms)`);
    },
  },
};
