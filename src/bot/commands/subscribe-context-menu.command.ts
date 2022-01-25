import { TransformPipe } from '@discord-nestjs/common';
import {
  Command,
  DiscordTransformedCommand,
  Payload,
  UsePipes,
} from '@discord-nestjs/core';
import { CommandInteraction, MessageContextMenuInteraction } from 'discord.js';
import { CommandService } from '../command.service';
import { Config } from './../../config';
import { ApplicationCommandTypes } from 'discord.js/typings/enums';
import * as linkifyIt from 'linkify-it'

@Command({
  name: 'subscribe',
  description: '',
  type: ApplicationCommandTypes.MESSAGE
})
@UsePipes(TransformPipe)
export class SubscribeContextMenuCommand
  implements DiscordTransformedCommand<any>
{
  private linkify = linkifyIt();

  constructor(
    private readonly commandService: CommandService,
    private readonly config: Config,
  ) { }

  async handler(
    @Payload() dto: any,
    interaction: CommandInteraction,
  ) {
    if (!interaction.isMessageContextMenu())
      return;

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

      const urls = this.linkify
        .match(interaction.targetMessage.content)
        .map(x => new URL(x.url))
        .filter(x => x.host === 'youtube.com' || x.host === 'www.youtube.com' || x.host === 'youtu.be');

      if (urls.length === 1) {
        const { isAlreadySubscribed, channel } =
          await this.commandService.subscribe(urls[0].toString());

        await interaction.editReply({
          content: null,
          embeds: [
            this.commandService.createSubscribeEmbed(
              isAlreadySubscribed,
              channel,
            ),
          ],
        });
      } else {
        for (const url of urls) {
          const { isAlreadySubscribed, channel } =
            await this.commandService.subscribe(url.toString());

          await interaction.followUp({
            content: null,
            embeds: [
              this.commandService.createSubscribeEmbed(
                isAlreadySubscribed,
                channel,
              ),
            ],
          })
        }

        await interaction.editReply(`Processed ${urls.length} channels`);
      }
    } catch (e) {
      if (interaction.deferred) await interaction.editReply(e.message);
      else await interaction.reply(e.message);
    }
  }
}
