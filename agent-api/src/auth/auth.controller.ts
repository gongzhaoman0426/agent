import { All, Controller, Req, Res } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';

@Public()
@Controller('auth')
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(private readonly authService: AuthService) {
    this.handler = toNodeHandler(this.authService.betterAuth);
  }

  @All('*')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    await this.handler(req, res);
  }
}
