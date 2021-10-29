import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(app.get(Config).port);
}
bootstrap();
