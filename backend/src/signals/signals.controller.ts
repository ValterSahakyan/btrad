import { Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('/:id/approve-paper')
  approvePaper(@Param('id') id: string) {
    return this.signalsService.approvePaper(id);
  }

  @Post('/:id/approve-live')
  approveLive(@Param('id') id: string) {
    return this.signalsService.approveLive(id);
  }

  @Post('/:id/skip')
  skip(@Param('id') id: string) {
    return this.signalsService.skip(id);
  }

  @Post('/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.signalsService.cancel(id);
  }
}
