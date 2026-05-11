import { randomBytes } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import Redis from 'ioredis';

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

interface NonceEntry {
  nonce: string;
  message: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis(this.configService.get<string>('redisUrl', 'redis://localhost:6379'), {
      maxRetriesPerRequest: null,
    });
  }

  generateNonce(address: string): { message: string } {
    const normalised = address.toLowerCase();
    const nonce = randomBytes(16).toString('hex');
    const timestamp = new Date().toISOString();
    const message = [
      'Sign in to PerpScout AI',
      '',
      `Wallet: ${address}`,
      `Nonce: ${nonce}`,
      `Issued: ${timestamp}`,
      '',
      'This signature only grants access to the dashboard.',
      'No transaction will be made.',
    ].join('\n');

    const entry: NonceEntry = {
      nonce,
      message,
      expiresAt: Date.now() + NONCE_TTL_MS,
    };
    void this.redis.set(this.nonceKey(normalised), JSON.stringify(entry), 'PX', NONCE_TTL_MS);

    return { message };
  }

  async verifyAndLogin(address: string, signature: string): Promise<string> {
    const allowedWallet = this.configService.get<string>('dashboardAllowedWallet', '');
    const normalised = address.toLowerCase();
    const rawEntry = await this.redis.get(this.nonceKey(normalised));
    const entry = rawEntry ? (JSON.parse(rawEntry) as NonceEntry) : null;

    if (!entry) {
      throw new UnauthorizedException('No pending nonce - request a new one');
    }
    if (Date.now() > entry.expiresAt) {
      await this.redis.del(this.nonceKey(normalised));
      throw new UnauthorizedException('Nonce expired - request a new one');
    }

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(entry.message, signature).toLowerCase();
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }

    if (recovered !== normalised) {
      throw new UnauthorizedException('Signature does not match the provided address');
    }

    if (allowedWallet && recovered !== allowedWallet) {
      throw new UnauthorizedException('Wallet not authorised');
    }

    await this.redis.del(this.nonceKey(normalised));

    const token = randomBytes(32).toString('hex');
    await this.redis.set(`session:${token}`, normalised, 'EX', SESSION_TTL_SEC);
    return token;
  }

  async isValidSession(token: string): Promise<boolean> {
    try {
      const value = await this.redis.get(`session:${token}`);
      return value !== null;
    } catch {
      return false;
    }
  }

  async getSessionAddress(token: string): Promise<string | undefined> {
    try {
      const value = await this.redis.get(`session:${token}`);
      return value ?? undefined;
    } catch {
      return undefined;
    }
  }

  async logout(token: string): Promise<void> {
    await this.redis.del(`session:${token}`);
  }

  private nonceKey(address: string): string {
    return `auth:nonce:${address}`;
  }
}
