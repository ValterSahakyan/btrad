import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { randomBytes } from 'crypto';

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface NonceEntry {
  nonce: string;
  message: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  // address (lowercase) → nonce entry
  private readonly pendingNonces = new Map<string, NonceEntry>();
  // session token → address
  private readonly sessions = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {}

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

    this.pendingNonces.set(normalised, {
      nonce,
      message,
      expiresAt: Date.now() + NONCE_TTL_MS,
    });

    return { message };
  }

  verifyAndLogin(address: string, signature: string): string {
    const allowedWallet = this.configService.get<string>('dashboardAllowedWallet', '');

    const normalised = address.toLowerCase();
    const entry = this.pendingNonces.get(normalised);

    if (!entry) {
      throw new UnauthorizedException('No pending nonce — request a new one');
    }
    if (Date.now() > entry.expiresAt) {
      this.pendingNonces.delete(normalised);
      throw new UnauthorizedException('Nonce expired — request a new one');
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

    this.pendingNonces.delete(normalised);

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, normalised);
    return token;
  }

  isValidSession(token: string): boolean {
    return this.sessions.has(token);
  }

  getSessionAddress(token: string): string | undefined {
    return this.sessions.get(token);
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }
}
