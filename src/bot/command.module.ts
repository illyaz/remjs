import { Module } from '@nestjs/common';
import { CommandService } from './command.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule.register({})],
  providers: [CommandService],
  exports: [CommandService],
})
export class CommandModule {}
