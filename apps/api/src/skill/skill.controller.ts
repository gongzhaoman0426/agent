import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SkillService } from './skill.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** multer 内存模式的上传文件，只取所需字段，避免依赖 Express.Multer 全局命名空间声明 */
interface UploadedZipFile {
  buffer: Buffer;
}

@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.skillService.list(user.userId);
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
