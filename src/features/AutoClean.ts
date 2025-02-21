import { Feature } from '.';

export const AutoClean: Feature = {
  async HandleMessage({ message }) {
    const { content } = message;
    const allWhitespace = /^[ *_\n]+$/g.test(content);

    if (allWhitespace) {
      await message.delete();
      return 'stop';
    }

    return;
  },
};
