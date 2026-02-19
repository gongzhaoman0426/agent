export interface CurrentUserPayload {
  userId: string;
  username: string;
  source: 'web' | 'api';
}
