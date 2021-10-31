import { Param, ParamType } from '@discord-nestjs/core';

export class ChannelOrIdDto {
  @Param({
    name: 'channel',
    description: 'channel id or url',
    required: true,
    type: ParamType.STRING,
  })
  channel: string;
}
