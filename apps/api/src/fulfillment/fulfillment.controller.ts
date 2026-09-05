import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { FulfillmentService } from './fulfillment.service';

class ReceiveDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsString() reference!: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) {}

  @Get('fulfillment')
  list() {
    return this.fulfillment.list();
  }

  @Get('fulfillment/:id')
  get(@Param('id') id: string) {
    return this.fulfillment.get(id);
  }

  @Post('fulfillment/from-quotation/:quotationId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OPERATIONS, UserRole.ADMIN, UserRole.SALES_MANAGER)
  create(@Param('quotationId') quotationId: string, @CurrentUser() user: AuthUser) {
    return this.fulfillment.createFromQuotation(quotationId, user);
  }

  @Post('fulfillment/:id/allocate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OPERATIONS, UserRole.ADMIN)
  allocate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fulfillment.allocate(id, user);
  }

  @Post('fulfillment/:id/fulfill')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OPERATIONS, UserRole.ADMIN)
  fulfill(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.fulfillment.fulfill(id, user);
  }

  @Get('inventory')
  inventory() {
    return this.fulfillment.listInventory();
  }

  @Get('warehouses')
  warehouses() {
    return this.fulfillment.listWarehouses();
  }

  @Post('inventory/receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OPERATIONS, UserRole.ADMIN)
  receive(@Body() dto: ReceiveDto, @CurrentUser() user: AuthUser) {
    return this.fulfillment.receive(dto, user);
  }
}
