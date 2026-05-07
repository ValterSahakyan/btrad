import { Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('/:id/close-paper')
  closePaper(@Param('id') id: string) {
    return this.tradesService.closePaper(id);
  }

  @Post('/:id/close-live')
  closeLive(@Param('id') id: string) {
    return this.tradesService.closeLive(id);
  }
}
