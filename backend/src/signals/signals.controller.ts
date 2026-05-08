import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CleanupSignalsDto } from './dto/cleanup-signals.dto';
import { SignalsService } from './signals.service';

@Controller('/api/signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  list() {
    return this.signalsService.list();
  }

  @Get('/:id')
  getById(@Param('id') id: string) {
    return this.signalsService.getById(id);
  }

  @Post('/:id/approve-live')
  approveLive(@Param('id') id: string, @Req() request: Request) {
    return this.signalsService.approveLive(id, getActor(request));
  }

  @Post('/:id/approve-paper')
  approvePaper(@Param('id') id: string, @Req() request: Request) {
    return this.signalsService.approvePaper(id, getActor(request));
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
