import { Feature, InteractionGuard } from '.';

export const Ping: Feature = {
  async Init(commands) {
    await commands.create({ name: 'ping', description: 'Replies with pong!' });
  },
  async HandleInteractionCreate(interaction) {
    const { chatInteraction } =
      (await InteractionGuard(interaction, 'ping', false)) ?? {};

    await chatInteraction?.reply('Pong!');
  },
};
