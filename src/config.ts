import { IsDefined, IsNumber, IsString, IsUrl } from 'class-validator';

export class Config {
  @IsNumber()
  public readonly port: number;

  @IsString()
  public readonly token: string;

  @IsString()
  public readonly applicationId: string;

  @IsString()
  public readonly owner: string;

  @IsString()
  public readonly prefix: string;

  @IsUrl()
  public readonly baseUrl: string;

  @IsString()
  public readonly userAgent: string;

  @IsString()
  public readonly database: string;

  @IsString()
  public readonly sauceNaoApiKey: string;

  @IsString()
  public readonly vtrackerEndpoint: string;

  @IsDefined()
  public readonly notifications: {
    [key: string]: { id: number; token: string; raw: boolean; send: string[] };
  };
}
