import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('/api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  login(
    @Body() body: { username: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.authService.login(body.username, body.password);
    response.cookie('perpscout_session', 'authenticated', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
    return result;
  }

  @Post('/logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('perpscout_session');
    return { success: true };
  }

  @Get('/me')
  me() {
    return this.authService.me();
  }
}
