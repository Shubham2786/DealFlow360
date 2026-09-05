import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicesController } from './invoices.controller';

@Module({
  imports: [AuthModule],
  controllers: [InvoicesController],
})
export class InvoicesModule {}
