import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  AddKnowledgeBaseToAgentDto,
  RemoveKnowledgeBaseFromAgentDto,
  ChatWithKnowledgeBaseDto,
} from './knowledge-base.type';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  async getAllKnowledgeBases(@CurrentUser() user: CurrentUserPayload) {
    return this.knowledgeBaseService.getAllKnowledgeBases(user.userId);
  }

  @Get(':id')
  async getKnowledgeBase(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.knowledgeBaseService.getKnowledgeBase(user.userId, id);
  }

  @Post()
  async createKnowledgeBase(
    @Body() createKnowledgeBaseDto: CreateKnowledgeBaseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.knowledgeBaseService.createKnowledgeBase(
      user.userId,
      createKnowledgeBaseDto.name,
      createKnowledgeBaseDto.description || '',
    );
  }

  @Put(':id')
  async updateKnowledgeBase(
    @Param('id') id: string,
    @Body() updateKnowledgeBaseDto: UpdateKnowledgeBaseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.knowledgeBaseService.updateKnowledgeBase(
      user.userId,
      id,
      updateKnowledgeBaseDto,
    );
    return { message: 'Knowledge base updated successfully' };
  }

  @Delete(':id')
  async deleteKnowledgeBase(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.knowledgeBaseService.deleteKnowledgeBase(user.userId, id);
    return { message: 'Knowledge base deleted successfully' };
  }

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const uploadedFile = await this.knowledgeBaseService.uploadFile(
      user.userId,
      id,
      file,
    );
    return {
      message: 'File uploaded successfully',
      file: uploadedFile,
    };
  }

  @Get(':id/files')
  async getFiles(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.knowledgeBaseService.getFiles(user.userId, id);
  }

  @Get(':id/files/:fileId')
  async getFileStatus(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.knowledgeBaseService.getFileStatus(user.userId, id, fileId);
  }

  @Post(':id/files/:fileId/train')
  async trainFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.knowledgeBaseService.trainFile(
      user.userId,
      id,
      fileId,
    );
    return {
      message: 'File training completed',
      status: result.status,
    };
  }

  @Delete(':id/files/:fileId')
  async deleteFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.knowledgeBaseService.deleteFile(user.userId, id, fileId);
    return { message: 'File deleted successfully' };
  }

  @Post(':id/chat')
  async chat(
    @Param('id') id: string,
    @Body() chatDto: ChatWithKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.chat(id, chatDto.message);
  }

  @Post(':id/link-agent')
  async linkToAgent(
    @Param('id') id: string,
    @Body() body: AddKnowledgeBaseToAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.knowledgeBaseService.linkKnowledgeBaseToAgent(
      user.userId,
      id,
      body.agentId,
    );
  }

  @Delete(':id/unlink-agent')
  async unlinkFromAgent(
    @Param('id') id: string,
    @Body() body: RemoveKnowledgeBaseFromAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.knowledgeBaseService.unlinkKnowledgeBaseFromAgent(
      user.userId,
      id,
      body.agentId,
    );
  }

  @Get('agent/:agentId')
  async getAgentKnowledgeBases(@Param('agentId') agentId: string) {
    return this.knowledgeBaseService.getAgentKnowledgeBases(agentId);
  }
}
