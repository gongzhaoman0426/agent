import { padRequest } from './client.js';

const STYLE_IMAGE_TEXT = 1;
const STYLE_TEXT = 2;
const MEDIA_TYPE_IMAGE = 1;

export type SnsMediaItem = {
  ID?: number;
  Type: number;
  URL: string;
  URLType?: string;
  Thumb?: string;
  ThumType?: string;
  MD5?: string;
  SizeWidth?: string;
  SizeHeight?: string;
  TotalSize?: string;
  Private?: number;
};

/** POST /sns/UploadFriendCircleImage — ImageDataList 为 base64 */
export async function uploadFriendCircleImages(input: {
  authKey: string;
  imageBase64List: string[];
}): Promise<unknown> {
  return padRequest('POST', '/sns/UploadFriendCircleImage', {
    key: input.authKey,
    body: {
      ImageDataList: input.imageBase64List,
      VideoDataList: [],
    },
    timeoutMs: 120_000,
  });
}

/** POST /sns/SendFriendCircle */
export async function sendFriendCircle(input: {
  authKey: string;
  content: string;
  mediaList?: SnsMediaItem[];
  privacy?: number;
}): Promise<unknown> {
  const hasMedia = Boolean(input.mediaList?.length);
  return padRequest('POST', '/sns/SendFriendCircle', {
    key: input.authKey,
    body: {
      Content: input.content,
      ContentStyle: hasMedia ? STYLE_IMAGE_TEXT : STYLE_TEXT,
      Privacy: input.privacy ?? 0,
      MediaList: input.mediaList ?? [],
      WithUserList: [],
      GroupUserList: [],
      BlackList: [],
      ContentUrl: '',
      Description: '',
    },
    timeoutMs: 60_000,
  });
}

export { MEDIA_TYPE_IMAGE };
