import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Urls {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  url: string;
}
