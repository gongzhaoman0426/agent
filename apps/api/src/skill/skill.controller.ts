import { Roles } from '../auth/auth.guard.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { writeSseStream } from '../common/sse.js';
import { SkillAssistantService } from './skill-assistant.service.js';
import { SkillService } from './skill.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** multer 内存模式的上传文件，只取所需字段，避免依赖 Express.Multer 全局命名空间声明 */
interface UploadedZipFile {
  buffer: Buffer;
}

const createSkillSchema = z.object({
  name: z.string().min(1, '技能名称不能为空').max(64),
  description: z.string().min(1, '技能简介不能为空').max(500),
});

const renameSkillSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    description: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.name || value.description, {
    message: '请提供要修改的名称或简介',
  });

const writeFileSchema = z.object({
  path: z.string().min(1, '文件路径不能为空'),
  content: z.string(),
});

const assistantChatSchema = z.object({
  message: z.string().min(1, '消息不能为空'),
});

@Roles('builder')
@Controller('skills')
export class SkillController {
  private readonly logger = new Logger(SkillController.name);

  constructor(
    private readonly skillService: SkillService,
    private readonly assistant: SkillAssistantService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.skillService.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = parse(createSkillSchema, body);
    return this.skillService.create(user.userId, dto.name, dto.description);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file?: UploadedZipFile,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('请上传技能压缩包（zip）');
    }
    return this.skillService.upload(user.userId, file.buffer);
  }

  @Patch(':name')
  rename(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
    @Body() body: unknown,
  ) {
    const dto = parse(renameSkillSchema, body);
    return this.skillService.rename(user.userId, name, dto);
  }

  // ---- 在线编辑（静态段在 :name 之后，路径不冲突） ----

  @Get(':name/files')
  listFiles(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
  ) {
    return this.skillService.listFiles(user.userId, name);
  }

  @Get(':name/file')
  readFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
    @Query('path') filePath?: string,
  ) {
    if (!filePath) {
      throw new BadRequestException('缺少 path 参数');
    }
    return this.skillService.readFile(user.userId, name, filePath);
  }

  @Put(':name/file')
  writeFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
    @Body() body: unknown,
  ) {
    const dto = parse(writeFileSchema, body);
    return this.skillService.writeFile(
      user.userId,
      name,
      dto.path,
      dto.content,
    );
  }

  @Delete(':name/file')
  deleteFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
    @Query('path') filePath?: string,
  ) {
    if (!filePath) {
      throw new BadRequestException('缺少 path 参数');
    }
    return this.skillService.deleteFile(user.userId, name, filePath);
  }

  // ---- 技能编辑助手 ----

  @Get(':name/assistant/history')
  assistantHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
  ) {
    return this.assistant.getHistory(user.userId, name);
  }

  @Delete(':name/assistant/history')
  resetAssistant(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
  ) {
    return this.assistant.resetHistory(user.userId, name);
  }

  @Post(':name/assistant/stream')
  async assistantStream(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const dto = parse(assistantChatSchema, body);
    await writeSseStream(
      res,
      this.assistant.chatStream(user.userId, name, dto.message),
      this.logger,
    );
  }

  @Get(':name')
  detail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
  ) {
    return this.skillService.getDetail(user.userId, name);
  }

  @Delete(':name')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('name') name: string,
  ) {
    return this.skillService.remove(user.userId, name);
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      `参数校验失败: ${result.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }
  return result.data;
}
