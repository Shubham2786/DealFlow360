import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersController } from './customers.controller';

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
})
export class CustomersModule {}
