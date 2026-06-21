import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  VectorStoreIndex,
  LlamaParseReader,
  MarkdownNodeParser,
  Settings,
} from 'llamaindex';
import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai';
import { PGVectorStore } from '@llamaindex/postgres';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { FileStatus } from '@prisma/client';
import { FileResponseDto, UpdateKnowledgeBaseDto } from './knowledge-base.type';

const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

@Injectable()
export class KnowledgeBaseService {
  private uploadDir: string;
  private logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private prisma: PrismaService,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory(directoryPath?: string) {
    try {
      await fs.access(directoryPath || this.uploadDir);
    } catch {
      await fs.mkdir(directoryPath || this.uploadDir, { recursive: true });
    }
  }

  private ensureLlamaIndexSettings() {
    Settings.embedModel = new OpenAIEmbedding({
      model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL,
      dimensions: 1536,
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
    });
    Settings.llm = new OpenAI({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
    });
  }

  private async createVectorStore(
    vectorStoreName: string,
  ): Promise<PGVectorStore> {
    this.ensureLlamaIndexSettings();
    const pgVectorStore = new PGVectorStore({
      clientConfig: {
        connectionString: process.env.DATABASE_URL,
      },
      dimensions: 1536,
      performSetup: true,
    });
    pgVectorStore.setCollection(vectorStoreName);
    return pgVectorStore;
  }

  private async createIndex(
    vectorStore: PGVectorStore,
  ): Promise<VectorStoreIndex> {
    return await VectorStoreIndex.fromVectorStore(vectorStore);
  }

  async getAllKnowledgeBases(userId?: string) {
    const whereClause = userId ? { createdById: userId } : {};
    return this.prisma.knowledgeBase.findMany({
      where: whereClause,
      include: {
        files: true,
      },
    });
  }

  async getAgentKnowledgeBases(agentId: string) {
    return this.prisma.agentKnowledgeBase.findMany({
      where: { agentId },
      include: {
        knowledgeBase: true,
      },
    });
  }

  async getKnowledgeBase(userId: string | undefined, knowledgeBaseId: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      include: {
        files: true,
      },
    });

    if (!knowledgeBase) {
      throw new NotFoundException(`Knowledge base with ID ${knowledgeBaseId} not found`);
    }

    // 如果提供了 userId，检查权限
    if (userId && knowledgeBase.createdById !== userId) {
      throw new ForbiddenException(
        `You don't have permission to access this knowledge base`,
      );
    }

    return knowledgeBase;
  }

  async updateKnowledgeBase(
    userId: string | undefined,
    knowledgeBaseId: string,
    updateKnowledgeBaseDto: UpdateKnowledgeBaseDto,
  ) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      throw new NotFoundException(`Knowledge base with ID ${knowledgeBaseId} not found`);
    }

    if (userId && knowledgeBase.createdById !== userId) {
      throw new ForbiddenException(
        `You don't have permission to update this knowledge base`,
      );
    }

    const updatedKnowledgeBase = await this.prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: updateKnowledgeBaseDto,
      include: {
        files: true,
      },
    });

    return updatedKnowledgeBase;
  }

  async createKnowledgeBase(userId: string | undefined, name: string, description: string) {
    const vectorStoreName = `kb_${userId || 'default'}_${name}`;
    const knowledgeBase = await this.prisma.knowledgeBase.create({
      data: {
        name,
        description,
        vectorStoreName,
        createdById: userId,
      },
    });

    await this.createVectorStore(vectorStoreName);

    return knowledgeBase;
  }

  async deleteKnowledgeBase(
    userId: string | undefined,
    knowledgeBaseId: string,
  ): Promise<void> {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      throw new NotFoundException(`Knowledge base with ID ${knowledgeBaseId} not found`);
    }

    if (userId && knowledgeBase.createdById !== userId) {
      throw new ForbiddenException(
        `You don't have permission to delete this knowledge base`,
      );
    }

    await this.prisma.agentKnowledgeBase.deleteMany({
      where: { knowledgeBaseId },
    });

    const files = await this.prisma.file.findMany({
      where: { knowledgeBaseId },
      select: { path: true },
    });

    await this.prisma.file.deleteMany({
      where: { knowledgeBaseId },
    });

    await this.prisma.knowledgeBase.delete({ where: { id: knowledgeBaseId } });

    try {
      const vectorStore = await this.createVectorStore(
        knowledgeBase.vectorStoreName,
      );
      await vectorStore.clearCollection();
    } catch (error: any) {
      this.logger.error(`Failed to clear vector store: ${error?.message || error}`);
    }

    await Promise.all(
      files.map((file) => this.removePhysicalFile(file.path)),
    );
  }

  async uploadFile(
    userId: string,
    knowledgeBaseId: string,
    file: any,
  ): Promise<FileResponseDto> {
    const knowledgeBase = await this.getKnowledgeBase(userId, knowledgeBaseId);
    if (!file?.buffer || !file?.originalname) {
      throw new BadRequestException('No file uploaded');
    }

    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const directoryPath = path.join(this.uploadDir, randomUUID());
    await this.ensureUploadDirectory(directoryPath);
    const filePath = path.join(directoryPath, fileName);

    await fs.writeFile(filePath, file.buffer);

    const uploadedFile = await this.prisma.file.create({
      data: {
        path: filePath,
        name: fileName,
        knowledgeBaseId: knowledgeBase.id,
        status: FileStatus.PENDING,
      },
    });

    return uploadedFile;
  }

  async getFiles(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<FileResponseDto[]> {
    await this.getKnowledgeBase(userId, knowledgeBaseId);
    return this.prisma.file.findMany({
      where: { knowledgeBaseId },
    });
  }

  async getFileStatus(
    userId: string,
    knowledgeBaseId: string,
    fileId: string,
  ): Promise<FileResponseDto> {
    await this.getKnowledgeBase(userId, knowledgeBaseId);
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundException(`File not found`);
    }

    return file;
  }

  async trainFile(
    userId: string,
    knowledgeBaseId: string,
    fileId: string,
  ): Promise<FileResponseDto> {
    const knowledgeBase = await this.getKnowledgeBase(userId, knowledgeBaseId);
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundException(`File not found`);
    }

    await this.prisma.file.update({
      where: { id: fileId },
      data: { status: FileStatus.PROCESSING },
    });

    try {
      const reader = new LlamaParseReader({
        resultType: 'markdown',
      });
      const markdownParser = new MarkdownNodeParser();

      const documents = await reader.loadData(file.path);

      documents.forEach((document: any) => {
        document.doc_id = fileId;
      });

      const nodes = markdownParser.getNodesFromDocuments(documents);

      nodes.forEach((node) => {
        node.metadata.file_id = fileId;
        this.logger.log(`训练内容：${node.text}`);
      });

      const vectorStore = await this.createVectorStore(
        knowledgeBase.vectorStoreName,
      );

      const index = await this.createIndex(vectorStore);

      await index.insertNodes(nodes);

      const trainedFile = await this.prisma.file.update({
        where: { id: fileId },
        data: { status: FileStatus.PROCESSED },
      });
      return trainedFile;
    } catch (error) {
      this.logger.error(`Failed to train file ${file.path}:`, error);
      const failedFile = await this.prisma.file.update({
        where: { id: fileId },
        data: { status: FileStatus.FAILED },
      });
      return failedFile;
    }
  }

  private async removePhysicalFile(filePath: string) {
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);

      const directoryPath = path.dirname(filePath);
      const files = await fs.readdir(directoryPath);
      if (files.length === 0) {
        await fs.rmdir(directoryPath);
      }
    } catch (error: any) {
      this.logger.warn(
        `Physical file ${filePath} does not exist or cannot be accessed: ${error?.message || error}`,
      );
    }
  }

  async deleteFile(
    userId: string,
    knowledgeBaseId: string,
    fileId: string,
  ): Promise<void> {
    const knowledgeBase = await this.getKnowledgeBase(userId, knowledgeBaseId);
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, knowledgeBaseId },
    });

    if (!file) {
      throw new NotFoundException(`File not found`);
    }

    await this.prisma.file.delete({
      where: { id: fileId },
    });

    await this.removePhysicalFile(file.path);

    try {
      const result = await this.prisma.$executeRawUnsafe(
        `DELETE FROM public.llamaindex_embedding WHERE collection = $1 AND metadata->>'file_id' = $2`,
        knowledgeBase.vectorStoreName,
        fileId,
      );
      this.logger.log(`[DeleteFile] Removed ${result} vector(s) for file ${fileId} from collection ${knowledgeBase.vectorStoreName}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to delete vector store data for file ${fileId}: ${error?.message || error}`,
      );
    }
  }

  async getIndex(knowledgeBaseId: string): Promise<VectorStoreIndex> {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });
    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found');
    }

    const vectorStore = await this.createVectorStore(
      knowledgeBase.vectorStoreName,
    );
    return await this.createIndex(vectorStore);
  }

  async chat(knowledgeBaseId: string, message: string, userId?: string) {
    const startTime = Date.now();
    // 通过 HTTP 端点调用时传入 userId，校验知识库归属，防止越权查询他人私有知识库；
    // 工具内部调用（已通过 Agent-知识库关联鉴权）则不传 userId。
    if (userId) {
      await this.getKnowledgeBase(userId, knowledgeBaseId);
    }
    this.logger.log(`[Query] Knowledge base: ${knowledgeBaseId}`);
    this.logger.log(`[Query] Question: ${message}`);

    const index = await this.getIndex(knowledgeBaseId);
    const queryEngine = index.asQueryEngine({
      similarityTopK: 10,
    });

    const response = await queryEngine.query({ query: message });

    const filteredSources = response.sourceNodes
      .map((node: any) => ({
        content: node.node?.text || node.node?.getContent?.() || '',
        score: node.score || 0,
        metadata: node.node?.metadata || {},
      }))
      .sort((a, b) => b.score - a.score);

    const elapsed = Date.now() - startTime;
    this.logger.log(`[Query] Matched ${filteredSources.length} sources (${elapsed}ms)`);
    filteredSources.slice(0, 3).forEach((src, i) => {
      this.logger.log(`[Query] Source #${i + 1} (score: ${src.score.toFixed(4)}): ${src.content.substring(0, 100)}...`);
    });
    this.logger.log(`[Query] Answer: ${response.toString().substring(0, 200)}${response.toString().length > 200 ? '...' : ''}`);

    return {
      answer: response.toString(),
      sources: filteredSources,
    };
  }

  async linkKnowledgeBaseToAgent(
    userId: string,
    knowledgeBaseId: string,
    agentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const knowledgeBase = await this.getKnowledgeBase(userId, knowledgeBaseId);
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent || agent.createdById !== userId) {
      throw new ForbiddenException(
        `You don't have permission to link this agent`,
      );
    }

    // 检查是否已经存在链接
    const existingLink = await this.prisma.agentKnowledgeBase.findUnique({
      where: {
        agentId_knowledgeBaseId: {
          agentId: agent.id,
          knowledgeBaseId: knowledgeBase.id,
        },
      },
    });

    if (existingLink) {
      return {
        success: false,
        message: 'Knowledge base already linked to agent',
      };
    }

    await this.prisma.agentKnowledgeBase.create({
      data: {
        agentId: agent.id,
        knowledgeBaseId: knowledgeBase.id,
      },
    });

    return { success: true, message: 'Knowledge base linked to agent' };
  }

  async unlinkKnowledgeBaseFromAgent(
    userId: string,
    knowledgeBaseId: string,
    agentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const knowledgeBase = await this.getKnowledgeBase(userId, knowledgeBaseId);
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent || agent.createdById !== userId) {
      throw new ForbiddenException(
        `You don't have permission to unlink this agent`,
      );
    }

    await this.prisma.agentKnowledgeBase.delete({
      where: {
        agentId_knowledgeBaseId: {
          agentId: agent.id,
          knowledgeBaseId: knowledgeBase.id,
        },
      },
    });

    return { success: true, message: 'Knowledge base unlinked from agent' };
  }
}
