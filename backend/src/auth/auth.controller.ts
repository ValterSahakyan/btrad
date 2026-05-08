import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('/api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('/nonce')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  nonce(@Query('address') address: string) {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { error: 'Invalid Ethereum address' };
    }
    return this.authService.generateNonce(address);
  }

  @Post('/login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: { address: string; signature: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.authService.verifyAndLogin(body.address, body.signature);
    response.cookie('perpscout_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { success: true, address: body.address };
  }

  @Post('/logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.['perpscout_session'] as string | undefined;
    if (token) await this.authService.logout(token);
    response.clearCookie('perpscout_session');
    return { success: true };
  }

  @Get('/me')
  async me(@Req() request: Request) {
    const token = request.cookies?.['perpscout_session'] as string | undefined;
    if (!token) return { authenticated: false };
    const address = await this.authService.getSessionAddress(token);
    if (!address) return { authenticated: false };
    return { authenticated: true, address };
  }
}
