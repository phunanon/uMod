import { Feature } from '.';

const warning = `Hello 👋
We detected that you sent four images with no caption in our server. These images have been automatically removed, as it is often someone spreading cryptocurrency scams.
**If you did not intentionally just sent four images with no caption, your account is likely compromised** - you should reset all your passwords and log out of all active sessions.
If you did intentionally send them, you can post again and just ensure to include a caption.
Watch [this video](https://youtu.be/V0ajSB_Ke5I?t=806) for a full breakdown. TL;DW: either you scanned a QR code, or downloaded malware (e.g. game cheats)`;

const dmCooldowns = new Set<string>();

export const ScamImageSpam: Feature = {
  async HandleMessageCreate({ message, member }) {
    if (
      message.attachments.size !== 4 ||
      message.content.trim() ||
      !message.attachments.every(attachment =>
        attachment.contentType?.startsWith('image/'),
      )
    )
      return;

    if (member.moderatable)
      await member
        .timeout(10_000, 'ScamImageSpam: sent 4 images with no caption')
        .catch(() => {});

    await message.delete().catch(() => {});

    if (!dmCooldowns.has(member.id)) {
      dmCooldowns.add(member.id);
      setTimeout(() => dmCooldowns.delete(member.id), 60_000);
      await member.send(warning).catch(() => {});
    }

    return 'stop';
  },
};
