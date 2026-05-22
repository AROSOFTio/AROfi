import { IsString, Length } from 'class-validator'

export class SetPayoutSecretDto {
  @IsString()
  @Length(8, 72)
  secretKey: string
}
