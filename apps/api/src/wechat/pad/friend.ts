import { padRequest } from './client.js';

/** POST /friend/AgreeAdd — 同意好友请求 OpCode=3 */
export async function agreeAddFriend(input: {
  authKey: string;
  v3: string;
  v4: string;
  scene: number;
}): Promise<unknown> {
  return padRequest('POST', '/friend/AgreeAdd', {
    key: input.authKey,
    body: {
      OpCode: 3,
      Scene: input.scene,
      V3: input.v3,
      V4: input.v4,
      VerifyContent: '',
      ChatRoomUserName: '',
    },
  });
}

/** POST /user/ModifyRemark */
export async function modifyRemark(input: {
  authKey: string;
  userName: string;
  remarkName: string;
}): Promise<unknown> {
  return padRequest('POST', '/user/ModifyRemark', {
    key: input.authKey,
    body: {
      UserName: input.userName,
      RemarkName: input.remarkName,
    },
  });
}

/** POST /friend/GetContactList */
export async function getContactList(input: {
  authKey: string;
  currentWxcontactSeq?: number;
  currentChatRoomContactSeq?: number;
}): Promise<unknown> {
  return padRequest('POST', '/friend/GetContactList', {
    key: input.authKey,
    body: {
      CurrentWxcontactSeq: input.currentWxcontactSeq ?? 0,
      CurrentChatRoomContactSeq: input.currentChatRoomContactSeq ?? 0,
    },
    timeoutMs: 90_000,
  });
}

/** POST /friend/SearchContact */
export async function searchContact(input: {
  authKey: string;
  userName: string;
}): Promise<unknown> {
  return padRequest('POST', '/friend/SearchContact', {
    key: input.authKey,
    body: {
      UserName: input.userName,
      FromScene: 0,
      SearchScene: 1,
      OpCode: 0,
    },
  });
}

/** POST /friend/GetContactDetailsList */
export async function getContactDetails(input: {
  authKey: string;
  userNames: string[];
}): Promise<unknown> {
  return padRequest('POST', '/friend/GetContactDetailsList', {
    key: input.authKey,
    body: {
      UserNames: input.userNames,
      RoomWxIDList: [],
    },
  });
}
