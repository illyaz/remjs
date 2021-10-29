import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Urls } from './entity';
import { Repository } from 'typeorm';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(
    @InjectRepository(Urls) private readonly urls: Repository<Urls>,
  ) {}

  @Get('/u/:id')
  async get(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    id++;
    const data = await this.urls.findOne(id);
    if (data) return res.redirect(data.url);
    return res.status(404).send(`url id '${id - 1}' not exist`);
  }
}
