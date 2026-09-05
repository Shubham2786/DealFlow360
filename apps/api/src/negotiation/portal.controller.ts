import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { NegotiationService } from './negotiation.service';

class RespondDto {
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) requestedDiscountPct?: number;
}

/**
 * PUBLIC, token-scoped customer portal. Intentionally NOT behind JwtAuthGuard.
 * Returns only customer-safe fields; no internal margin/notes/cost/salesperson.
 */
@Controller('portal')
export class PortalController {
  constructor(private readonly negotiation: NegotiationService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.negotiation.publicView(token);
  }

  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: RespondDto) {
    return this.negotiation.respond(token, 'accept', dto.message);
  }

  @Post(':token/reject')
  reject(@Param('token') token: string, @Body() dto: RespondDto) {
    return this.negotiation.respond(token, 'reject', dto.message);
  }

  @Post(':token/request-change')
  requestChange(@Param('token') token: string, @Body() dto: RespondDto) {
    return this.negotiation.respond(token, 'request-change', dto.message, dto.requestedDiscountPct);
  }
}
