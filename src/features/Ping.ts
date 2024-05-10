import { Feature } from '.';

export const Ping: Feature = {
  async Init(commands) {
    await commands.create({ name: 'ping', description: 'Replies with pong!' });
  },
  Interaction: {
    commandName: 'ping',
    moderatorOnly: false,
    async handler({ interaction }) {
      await interaction.reply('Pong!');
    },
  },
};
