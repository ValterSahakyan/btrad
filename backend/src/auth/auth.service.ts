import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  login(username: string, password: string): { success: boolean } {
    const validUsername = this.configService.get<string>('dashboardUsername', 'admin');
    const validPassword = this.configService.get<string>('dashboardPassword', '');

    if (username !== validUsername || password !== validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { success: true };
  }

  me(): { authenticated: boolean; username: string } {
    return { authenticated: true, username: this.configService.get<string>('dashboardUsername', 'admin') };
  }
}
