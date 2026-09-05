import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

import { ConfigController } from './config.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, ConfigController],
  providers: [UsersService],
})
export class UsersModule {}
