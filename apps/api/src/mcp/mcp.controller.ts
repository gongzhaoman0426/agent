import { Roles } from '../auth/auth.guard.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { McpServerService } from './mcp-server.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(64),
  url: z.string().min(1).max(2000),
});

const probeSchema = z.object({
  url: z.string().min(1).max(2000),
});

function parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new BadRequestException(`参数校验失败: ${detail}`);
  }
  return result.data as z.infer<T>;
}

@Roles('builder')
@Controller('mcp-servers')
export class McpController {
  constructor(private readonly mcpServers: McpServerService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.mcpServers.list(user.userId);
  }

  @Post('probe')
  probe(@Body() body: unknown) {
    const dto = parse(probeSchema, body);
    return this.mcpServers.probe(dto.url);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = parse(createSchema, body);
    return this.mcpServers.create(user.userId, dto);
  }

  @Post(':id/refresh')
  refresh(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.mcpServers.refresh(user.userId, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.mcpServers.remove(user.userId, id);
  }
}
