import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Inbox,
  MessagesSquare,
  PauseCircle,
  PlayCircle,
  SendHorizontal,
  Users,
} from 'lucide-react';
import { isSubmitEnter } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import {
  useSendWechatInboxMessage,
  useSetWechatAutoReply,
  useWechatAccounts,
  useWechatInbox,
  useWechatInboxMessages,
  useWechatPeerProfile,
} from '@/services/queries';
import type { UiMessage } from '@/types';
import { Button } from '@/ui/button';

interface InboxSearch {
  account?: string;
  peer?: string;
}

export const Route = createFileRoute('/_app/wechat-inbox')({
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    account: typeof search.account === 'string' ? search.account : undefined,
    peer: typeof search.peer === 'string' ? search.peer : undefined,
  }),
  component: WechatInboxPage,
});

function WechatInboxPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { account: accountId, peer: peerWxid } = Route.useSearch();
  const { data: accounts, isLoading: loadingAccounts } = useWechatAccounts();

  const activeAccountId = useMemo(() => {
    if (accountId && accounts?.some((a) => a.id === accountId)) {
      return accountId;
    }
    return accounts?.[0]?.id;
  }, [accountId, accounts]);

  useEffect(() => {
    if (!accounts?.length) return;
    if (!accountId || !accounts.some((a) => a.id === accountId)) {
      void navigate({
        search: (prev) => ({
          ...prev,
          account: accounts[0].id,
          peer: prev.peer,
        }),
        replace: true,
      });
    }
  }, [accountId, accounts, navigate]);

  const inbox = useWechatInbox(activeAccountId ?? null);
  const conversation = useWechatInboxMessages(
    activeAccountId ?? null,
    peerWxid ?? null,
  );
  const profile = useWechatPeerProfile(
    activeAccountId ?? null,
    peerWxid ?? null,
  );
  const sendMessage = useSendWechatInboxMessage();
  const setAutoReply = useSetWechatAutoReply();

  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = conversation.data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerWxid]);

  const paused = Boolean(
    inbox.data?.autoReplyPaused ??
      accounts?.find((a) => a.id === activeAccountId)?.autoReplyPaused,
  );

  const activeAccount = accounts?.find((a) => a.id === activeAccountId);
  const displayPeer =
    profile.data?.profile.displayName ||
    conversation.data?.title ||
    peerWxid ||
    '选择会话';

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !activeAccountId || !peerWxid || sendMessage.isPending) return;
    setDraft('');
    try {
      await sendMessage.mutateAsync({
        accountId: activeAccountId,
        peerWxid,
        text,
      });
    } catch {
      setDraft(text);
    }
  };

  if (loadingAccounts) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        加载微信号…
      </div>
    );
  }

  if (!accounts?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Inbox className="h-10 w-10 text-faint" />
        <p className="text-[15px] font-medium">还没有绑定微信号</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          请先在「构建 → 微信绑定」扫码绑定，再回到这里查看聊天与人工回复。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* 账号 + 会话列表 */}
      <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-card/60">
        <div className="space-y-2 border-b border-border px-4 py-4">
          <p className="text-[13px] font-semibold">微信工作台</p>
          <select
            className="h-9 w-full rounded-lg border border-border bg-card px-2 text-[13px]"
            value={activeAccountId ?? ''}
            onChange={(e) =>
              void navigate({
                search: { account: e.target.value, peer: undefined },
              })
            }
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.nickname || acc.wxid}
                {!acc.enabled ? '（已停用）' : ''}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant={paused ? 'soft' : 'outline'}
            className="w-full"
            disabled={!activeAccountId || setAutoReply.isPending}
            onClick={() => {
              if (!activeAccountId) return;
              void setAutoReply.mutateAsync({
                accountId: activeAccountId,
                paused: !paused,
              });
            }}
          >
            {paused ? (
              <>
                <PlayCircle className="h-3.5 w-3.5" />
                AI 已暂停 · 点击恢复
              </>
            ) : (
              <>
                <PauseCircle className="h-3.5 w-3.5" />
                AI 自动回复中 · 点击暂停
              </>
            )}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {(inbox.data?.conversations ?? []).length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-faint">
              暂无微信会话。有人私聊或群里说话后会出现在这里。
            </p>
          )}
          {(inbox.data?.conversations ?? []).map((item) => {
            const active = item.peerWxid === peerWxid;
            return (
              <button
                key={item.sessionId}
                type="button"
                onClick={() =>
                  void navigate({
                    search: {
                      account: activeAccountId,
                      peer: item.peerWxid,
                    },
                  })
                }
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'bg-primary-soft text-primary'
                    : 'hover:bg-muted text-foreground',
                )}
              >
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                  {item.isGroup ? (
                    <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  ) : (
                    <MessagesSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  )}
                  <span className="truncate">
                    {item.title || item.peerWxid}
                  </span>
                </span>
                <span
                  className={cn(
                    'truncate pl-5 text-[11px]',
                    active ? 'text-primary/70' : 'text-faint',
                  )}
                >
                  {item.peerWxid}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 消息区 */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{displayPeer}</p>
            <p className="truncate text-[11px] text-faint">
              {peerWxid
                ? `${conversation.data?.isGroup ? '群聊' : '私聊'} · ${peerWxid}`
                : '从左侧选择会话'}
              {activeAccount
                ? ` · 号主 ${activeAccount.nickname || activeAccount.wxid}`
                : ''}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
              paused
                ? 'bg-amber-500/15 text-amber-700'
                : 'bg-emerald-500/15 text-emerald-700',
            )}
          >
            {paused ? '人工模式' : 'AI 自动回复'}
          </span>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {!peerWxid && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-faint">
              <Inbox className="h-8 w-8" />
              选择左侧会话查看微信消息
            </div>
          )}
          {peerWxid && messages.length === 0 && (
            <p className="py-10 text-center text-sm text-faint">
              该会话暂无消息记录
            </p>
          )}
          {messages.map((message) => (
            <InboxMessage key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
            <textarea
              value={draft}
              disabled={!peerWxid || sendMessage.isPending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (isSubmitEnter(e)) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={2}
              placeholder={
                peerWxid
                  ? paused
                    ? '人工回复（不会触发 AI）…'
                    : '人工回复会直接发到微信；AI 仍可能自动回复，可先暂停 AI'
                  : '请先选择会话'
              }
              className="min-h-[52px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-faint"
            />
            <Button
              size="icon"
              disabled={
                !peerWxid || !draft.trim() || sendMessage.isPending
              }
              onClick={() => void onSend()}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* 对端资料 */}
      <aside className="hidden h-full w-[240px] shrink-0 flex-col border-l border-border bg-card/40 lg:flex">
        <div className="border-b border-border px-4 py-4">
          <p className="text-[13px] font-semibold">会话资料</p>
        </div>
        {!peerWxid ? (
          <p className="px-4 py-6 text-xs text-faint">选择会话后显示资料</p>
        ) : (
          <div className="space-y-3 px-4 py-4 text-[13px]">
            <div>
              <p className="text-[11px] text-faint">显示名</p>
              <p className="mt-0.5 font-medium">
                {profile.data?.profile.displayName || '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-faint">类型</p>
              <p className="mt-0.5">
                {profile.data?.isGroup || conversation.data?.isGroup
                  ? '群聊'
                  : '私聊好友'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-faint">微信 ID</p>
              <p className="mt-0.5 break-all font-mono text-[12px]">
                {peerWxid}
              </p>
            </div>
            {!profile.data?.isGroup && (
              <>
                <div>
                  <p className="text-[11px] text-faint">昵称</p>
                  <p className="mt-0.5">
                    {profile.data?.profile.nickName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-faint">备注</p>
                  <p className="mt-0.5">
                    {profile.data?.profile.remark || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-faint">微信号</p>
                  <p className="mt-0.5">
                    {profile.data?.profile.alias || '—'}
                  </p>
                </div>
              </>
            )}
            {profile.data?.isGroup && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                群资料暂只展示群 ID；成员列表后续可再接入。
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function InboxMessage({ message }: { message: UiMessage }) {
  const isPeer = message.role === 'user';
  const isOperator =
    !isPeer && message.content.trimStart().startsWith('[人工回复]');
  const content = isOperator
    ? message.content.replace(/^\[人工回复\]\n?/, '')
    : message.content;
  const label = isPeer ? '对方' : isOperator ? '人工回复' : 'AI 回复';

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1',
        isPeer ? 'items-start' : 'items-end',
      )}
    >
      <span className="px-1 text-[11px] text-faint">{label}</span>
      <div
        className={cn(
          'max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isPeer &&
            'rounded-bl-md border border-border bg-muted text-foreground',
          !isPeer &&
            !isOperator &&
            'rounded-br-md bg-primary text-primary-foreground',
          isOperator &&
            'rounded-br-md border border-amber-500/35 bg-amber-50 text-foreground',
        )}
      >
        {content}
      </div>
    </div>
  );
}
