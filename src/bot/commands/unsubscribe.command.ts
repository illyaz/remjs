import {
  Command,
  DiscordTransformedCommand,
  Payload,
  UsePipes,
} from '@discord-nestjs/core';
import { TransformPipe } from '@discord-nestjs/common';
import { ChannelOrIdDto } from '../dto/channel-or-id.dto';
import { CommandInteraction } from 'discord.js';
import { CommandService } from '../command.service';

@Command({
  name: 'unsub',
  description: 'Subscribe youtube channel',
})
@UsePipes(TransformPipe)
export class UnsubscribeCommand
  implements DiscordTransformedCommand<ChannelOrIdDto>
{
  constructor(private readonly commandService: CommandService) {}

  async handler(
    @Payload() dto: ChannelOrIdDto,
    interaction: CommandInteraction,
  ) {
    try {
      const deferPromise = interaction.deferReply();
      const { isAlreadyUnsubscribed, channel } =
        await this.commandService.unsubscribe(dto.channel);

      await deferPromise;
      await interaction.editReply({
        content: null,
        embeds: [
          this.commandService.createUnsubscribeEmbed(
            isAlreadyUnsubscribed,
            channel,
          ),
        ],
      });
    } catch (e) {
      if (interaction.deferred) await interaction.editReply(e.message);
      else await interaction.reply(e.message);
    }
  }
}
