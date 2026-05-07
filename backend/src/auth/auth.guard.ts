import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from './auth.service';

const PUBLIC_ROUTES = new Set(['/health', '/api/auth/login', '/api/auth/logout']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const authEnabled = this.configService.get<boolean>('dashboardAuthEnabled', true);
    if (!authEnabled) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (PUBLIC_ROUTES.has(request.path)) return true;

    const token = request.cookies?.['perpscout_session'] as string | undefined;
    if (!token || !this.authService.isValidSession(token)) {
      throw new UnauthorizedException('Not authenticated');
    }
    return true;
  }
}
