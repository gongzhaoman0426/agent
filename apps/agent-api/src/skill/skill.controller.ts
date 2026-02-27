import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SkillService } from './skill.service';
import { CreateSkillDto, UpdateSkillDto, AssignSkillsDto } from './skill.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CurrentUserPayload } from '../auth/auth.type';

@Controller('skills')
@UseGuards(JwtAuthGuard)
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.skillService.findAll(user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.skillService.findOne(id, user.userId);
  }

  @Post()
  async create(
    @Body() createSkillDto: CreateSkillDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.skillService.create(createSkillDto, user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateSkillDto: UpdateSkillDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.skillService.update(id, updateSkillDto, user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.skillService.remove(id, user.userId);
  }

  // ========== Agent 技能关联 ==========

  @Get('agent/:agentId')
  async getAgentSkills(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.skillService.getAgentSkills(agentId, user.userId);
  }

  @Post('agent/:agentId')
  async assignSkillsToAgent(
    @Param('agentId') agentId: string,
    @Body() assignSkillsDto: AssignSkillsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.skillService.assignSkillsToAgent(
      agentId,
      assignSkillsDto.skillIds,
      user.userId,
    );
  }

  @Delete('agent/:agentId/:skillId')
  async removeSkillFromAgent(
    @Param('agentId') agentId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillService.removeSkillFromAgent(agentId, skillId);
  }
}
