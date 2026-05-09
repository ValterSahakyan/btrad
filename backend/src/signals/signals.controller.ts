import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { CleanupSignalsDto } from './dto/cleanup-signals.dto';
import { SignalsService } from './signals.service';

@Controller('/api/signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  list() {
    return this.signalsService.list();
  }

  @Get('/export/daily')
  async exportDaily(@Query('date') date: string | undefined, @Res() response: Response) {
    const result = await this.signalsService.exportDailyCsv(date);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.csv);
  }

  @Get('/:id')
  getById(@Param('id') id: string) {
    return this.signalsService.getById(id);
  }

  @Post('/:id/approve-live')
  approveLive(@Param('id') id: string, @Req() request: Request) {
    return this.signalsService.approveLive(id, getActor(request));
  }

  @Post('/:id/skip')
  skip(@Param('id') id: string) {
    return this.signalsService.skip(id);
  }

  @Post('/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.signalsService.cancel(id);
  }

  @Post('/cleanup')
  cleanup(@Body() input: CleanupSignalsDto, @Req() request: Request) {
    return this.signalsService.cleanupOldSignals(getActor(request), input.olderThanDays);
  }
}

function getActor(request: Request): string {
  return ((request as Request & { authAddress?: string }).authAddress ?? 'system').toLowerCase();
}
