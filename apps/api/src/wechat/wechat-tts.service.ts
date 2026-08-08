import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encode as encodeSilk } from 'silk-wasm';

const SAMPLE_RATE = 24_000;
const MAX_TEXT_LEN = 300;

export type WechatTtsResult = {
  silkBase64: string;
  voiceSecond: number;
};

@Injectable()
export class WechatTtsService {
  private readonly logger = new Logger(WechatTtsService.name);

  /**
   * 文字 → 本机 TTS → ffmpeg pcm → silk。
   * 仅用本地免费合成：macOS `say` / Linux `espeak-ng`。
   */
  async synthesizeSilk(text: string): Promise<WechatTtsResult> {
    const content = text.trim();
    if (!content) {
      throw new Error('语音文本不能为空');
    }
    if (content.length > MAX_TEXT_LEN) {
      throw new Error(`语音文本过长，请控制在 ${MAX_TEXT_LEN} 字以内`);
    }

    const dir = await mkdtemp(join(tmpdir(), 'wechat-tts-'));
    const audioPath = join(dir, 'speech.bin');
    const pcmPath = join(dir, 'speech.pcm');

    try {
      await this.localSpeechToFile(content, audioPath);
      await this.ffmpegToPcm(audioPath, pcmPath);
      const pcm = await readFile(pcmPath);
      const silk = await encodeSilk(pcm, SAMPLE_RATE);
      const voiceSecond = Math.max(
        1,
        Math.min(60, Math.ceil((silk.duration || 0) / 1000) || 1),
      );

      this.logger.log(`本地 TTS 成功 seconds=${voiceSecond}`);
      return {
        silkBase64: Buffer.from(silk.data).toString('base64'),
        voiceSecond,
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** macOS `say` / Linux `espeak-ng` */
  private async localSpeechToFile(text: string, outputPath: string) {
    if (process.platform === 'darwin') {
      const aiffPath = `${outputPath}.aiff`;
      const voice = process.env.WECHAT_TTS_LOCAL_VOICE?.trim() || 'Tingting';
      await this.runCommand('say', ['-v', voice, '-o', aiffPath, text]);
      await writeFile(outputPath, await readFile(aiffPath));
      await rm(aiffPath, { force: true }).catch(() => undefined);
      return;
    }

    const wavPath = `${outputPath}.wav`;
    const voice = process.env.WECHAT_TTS_LOCAL_VOICE?.trim() || 'zh';
    try {
      await this.runCommand('espeak-ng', ['-v', voice, '-w', wavPath, text]);
    } catch {
      await this.runCommand('espeak', ['-v', voice, '-w', wavPath, text]);
    }
    await writeFile(outputPath, await readFile(wavPath));
    await rm(wavPath, { force: true }).catch(() => undefined);
  }

  private runCommand(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        reject(new Error(`无法启动 ${cmd}: ${error.message}`));
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `${cmd} 退出码 ${code}${stderr ? `: ${stderr.slice(-200)}` : ''}`,
          ),
        );
      });
    });
  }

  private ffmpegToPcm(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'ffmpeg',
        [
          '-y',
          '-i',
          inputPath,
          '-ar',
          String(SAMPLE_RATE),
          '-ac',
          '1',
          '-f',
          's16le',
          outputPath,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        reject(
          new Error(
            `无法启动 ffmpeg（发送语音需要本机安装 ffmpeg）: ${error.message}`,
          ),
        );
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        this.logger.warn(`ffmpeg 失败: ${stderr.slice(-400)}`);
        reject(new Error(`ffmpeg 转码失败 code=${code}`));
      });
    });
  }
}
