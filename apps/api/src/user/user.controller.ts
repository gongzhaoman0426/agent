import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { OperatorService } from './operator.service.js';

const createOperatorSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(6),
  name: z.string().optional(),
  accountIds: z.array(z.string()).default([]),
});

const updateOperatorSchema = z.object({
  name: z.string().optional(),
  password: z.string().min(6).optional(),
  accountIds: z.array(z.string()).optional(),
});

@Controller()
export class UserController {
  constructor(private readonly operators: OperatorService) {}

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.operators.getProfile(user.userId);
  }

  @Roles('builder')
  @Get('operators')
  listOperators(@CurrentUser() user: CurrentUserPayload) {
    return this.operators.listOperators(user.userId);
  }

  @Roles('builder')
  @Post('operators')
  createOperator(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const parsed = createOperatorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败');
    }
    return this.operators.createOperator({
      creatorId: user.userId,
      ...parsed.data,
    });
  }

  @Roles('builder')
  @Patch('operators/:id')
  updateOperator(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = updateOperatorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败');
    }
    return this.operators.updateOperator({
      creatorId: user.userId,
      operatorId: id,
      ...parsed.data,
    });
  }

  @Roles('builder')
  @Delete('operators/:id')
  removeOperator(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.operators.removeOperator(user.userId, id);
  }
}
