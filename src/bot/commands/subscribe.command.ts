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
import { Config } from './../../config';

@Command({
  name: 'sub',
  description: 'Subscribe youtube channel',
})
@UsePipes(TransformPipe)
export class SubscribeCommand
  implements DiscordTransformedCommand<ChannelOrIdDto>
{
  constructor(
    private readonly commandService: CommandService,
    private readonly config: Config,
  ) {}

  async handler(
    @Payload() dto: ChannelOrIdDto,
    interaction: CommandInteraction,
  ) {
    try {
      await interaction.deferReply();
      if (
        !this.config.notificationManageUserIds.includes(
          interaction.member.user.id,
        )
      ) {
        await interaction.editReply({ content: 'You not have permission' });
        return;
      }

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
