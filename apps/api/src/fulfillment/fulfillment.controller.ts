import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { Permission, UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { FulfillmentService } from './fulfillment.service';

class ReceiveDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) { }

  @Get('fulfillment')
  list(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers are not permitted to access fulfillment data');
    }
    return this.fulfillment.list(user);
  }

  @Get('fulfillment/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers are not permitted to access fulfillment data');
    }
    return this.fulfillment.get(id, user);
  }

  @Post('fulfillment/from-quotation/:quotationId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.TASK_ALLOCATE)
  create(@Param('quotationId') quotationId: string, @CurrentUser() user: AuthUser) {
    return this.fulfillment.createFromQuotation(quotationId, user);
  }

  @Post('fulfillment/:id/allocate')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.TASK_ALLOCATE)
  allocate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fulfillment.allocate(id, user);
  }

  @Post('fulfillment/:id/fulfill')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.TASK_ALLOCATE)
  fulfill(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fulfillment.fulfill(id, user);
  }

  @Get('inventory')
  inventory(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers are not permitted to access internal inventory');
    }
    return this.fulfillment.listInventory();
  }

  @Get('warehouses')
  warehouses(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers are not permitted to access internal warehouses');
    }
    return this.fulfillment.listWarehouses();
  }

  @Post('inventory/receive')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.TASK_ALLOCATE)
  receive(@Body() dto: ReceiveDto, @CurrentUser() user: AuthUser) {
    // Idempotency key is always server-generated — never trusted from the client
    return this.fulfillment.receive({ ...dto, reference: randomUUID() }, user);
  }
}
