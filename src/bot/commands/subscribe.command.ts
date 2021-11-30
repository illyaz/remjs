import { TransformPipe } from '@discord-nestjs/common';
import {
  Command,
  DiscordTransformedCommand,
  Payload,
  UsePipes,
} from '@discord-nestjs/core';
import { CommandInteraction } from 'discord.js';
import { ChannelOrIdDto } from '../dto/channel-or-id.dto';
import { CommandService } from '../command.service';

@Command({
  name: 'sub',
  description: 'Subscribe youtube channel',
})
@UsePipes(TransformPipe)
export class SubscribeCommand
  implements DiscordTransformedCommand<ChannelOrIdDto>
{
  constructor(private readonly commandService: CommandService) {}

  async handler(
    @Payload() dto: ChannelOrIdDto,
    interaction: CommandInteraction,
  ) {
    try {
      await interaction.deferReply();
      const { isAlreadySubscribed, channel } =
        await this.commandService.subscribe(dto.channel);

      await interaction.editReply({
        content: null,
        embeds: [
          this.commandService.createSubscribeEmbed(
            isAlreadySubscribed,
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
