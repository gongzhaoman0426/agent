import { Controller, Post, Get, Delete, Param, Body } from '@nestjs/common';
import { AccessTokenService, CreateAccessTokenDto } from './access-token.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';

@Controller('access-tokens')
export class AccessTokenController {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  @Post()
  async create(
    @Body() dto: CreateAccessTokenDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.accessTokenService.create(user.userId, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.accessTokenService.findAllByUser(user.userId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.accessTokenService.remove(id, user.userId);
  }
}
