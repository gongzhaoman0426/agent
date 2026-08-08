import { padRequest } from './client.js';

/** POST /group/CreateChatRoom */
export async function createChatRoom(input: {
  authKey: string;
  topic?: string;
  userList: string[];
}): Promise<unknown> {
  return padRequest('POST', '/group/CreateChatRoom', {
    key: input.authKey,
    body: {
      TopIc: input.topic?.trim() || '',
      UserList: input.userList,
    },
  });
}

/** POST /group/InviteChatroomMembers */
export async function inviteChatroomMembers(input: {
  authKey: string;
  chatRoomName: string;
  userList: string[];
}): Promise<unknown> {
  return padRequest('POST', '/group/InviteChatroomMembers', {
    key: input.authKey,
    body: {
      ChatRoomName: input.chatRoomName,
      UserList: input.userList,
    },
  });
}

/** POST /group/AddChatRoomMembers — 直接拉人（群人数较少时） */
export async function addChatRoomMembers(input: {
  authKey: string;
  chatRoomName: string;
  userList: string[];
}): Promise<unknown> {
  return padRequest('POST', '/group/AddChatRoomMembers', {
    key: input.authKey,
    body: {
      ChatRoomName: input.chatRoomName,
      UserList: input.userList,
    },
  });
}

/** POST /group/SetChatroomAnnouncement */
export async function setChatroomAnnouncement(input: {
  authKey: string;
  chatRoomName: string;
  content: string;
}): Promise<unknown> {
  return padRequest('POST', '/group/SetChatroomAnnouncement', {
    key: input.authKey,
    body: {
      ChatRoomName: input.chatRoomName,
      Content: input.content,
    },
  });
}
