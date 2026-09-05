import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, TokenPair } from './auth.service';
import { LoginDto, SignupDto } from './dto/auth.dto';
import {
  ACCESS_COOKIE,
  JwtAuthGuard,
  REFRESH_COOKIE,
} from './guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookies(res: Response, tokens: TokenPair): void {
    const secure = process.env.NODE_ENV === 'production';
    const common = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure,
      path: '/',
    };
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...common,
      maxAge: Number(process.env.JWT_ACCESS_TTL ?? 900) * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...common,
      maxAge: Number(process.env.JWT_REFRESH_TTL ?? 604800) * 1000,
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.signup(dto);
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto);
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const current = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    const tokens = await this.auth.refresh(current);
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const current = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    await this.auth.logout(current);
    this.clearCookies(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
