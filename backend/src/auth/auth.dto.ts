import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class ForgotDto {
  @IsEmail() email: string;
}

export class ResetDto {
  @IsString() token: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}
