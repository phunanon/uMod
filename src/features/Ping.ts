import { Feature } from '.';

export const Ping: Feature = {
  async Init(commands) {
    await commands.create({ name: 'ping', description: 'Replies with pong!' });
  },
  Interaction: {
    name: 'ping',
    moderatorOnly: false,
    async command({ interaction }) {
      await interaction.reply('Pong!');
    },
  },
};
