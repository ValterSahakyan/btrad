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
    const cookieOptions = getSessionCookieOptions();
    response.cookie('perpscout_session', token, {
      ...cookieOptions,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { success: true, address: body.address };
  }

  @Post('/logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.['perpscout_session'] as string | undefined;
    if (token) await this.authService.logout(token);
    response.clearCookie('perpscout_session', getSessionCookieOptions());
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

function getSessionCookieOptions(): { secure: boolean; domain?: string; path: string } {
  const secure = process.env.NODE_ENV === 'production';

  // Host-only cookie by default (no Domain attribute). The browser only ever
  // talks to the frontend origin — the frontend proxies to the backend
  // server-side — so a host-scoped cookie is all that's needed, and it works
  // everywhere: localhost, an IP, *.up.railway.app / *.onrender.com (where an
  // explicit Domain is rejected as a public-suffix + 1), and a custom domain.
  //
  // Set AUTH_COOKIE_DOMAIN only for deliberate cross-subdomain sharing, e.g.
  // frontend on app.example.com + backend on api.example.com sharing
  // ".example.com". This project's proxy setup does not need that.
  const explicitDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicitDomain) {
    return { secure, domain: explicitDomain.replace(/^\./, ''), path: '/' };
  }

  return { secure, path: '/' };
}
