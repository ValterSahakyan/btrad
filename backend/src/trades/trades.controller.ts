import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { TradesService } from './trades.service';

@Controller('/api/trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get()
  list() {
    return this.tradesService.list();
  }

  @Get('/:id')
  getById(@Param('id') id: string) {
    return this.tradesService.getById(id);
  }

  @Post('/:id/close-live')
  closeLive(@Param('id') id: string, @Req() request: Request) {
    return this.tradesService.closeLive(id, getActor(request));
  }

  @Post('/cleanup')
  clearClosed() {
    return this.tradesService.clearClosed();
  }
}

function getActor(request: Request): string {
  return ((request as Request & { authAddress?: string }).authAddress ?? 'system').toLowerCase();
}
