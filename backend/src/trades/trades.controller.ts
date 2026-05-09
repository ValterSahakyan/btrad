import { Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TradesService } from './trades.service';

@Controller('/api/trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get()
  list() {
    return this.tradesService.list();
  }

  @Get('/export/daily')
  async exportDaily(@Query('date') date: string | undefined, @Res() response: Response) {
    const result = await this.tradesService.exportDailyCsv(date);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.csv);
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
