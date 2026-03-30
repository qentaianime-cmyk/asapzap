"use client"

import { AnimatedThemeToggler } from "@/components/custom/animated-theme-toggler"
import { ThemeColorToggle } from "@/components/custom/theme-color-toggle"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loading } from "@/components/ui/loading"
import { client } from "@/lib/client"
import { useRealtime } from "@/lib/realtime-client"
import { cn } from "@/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { nanoid } from "nanoid"
import { useParams, useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

const MAX_CHARS = 1000
const WARN_CHARS = 800
const TYPING_THROTTLE_MS = 2000
const PRESENCE_INTERVAL_MS = 20_000
const AWAY_TIMEOUT_MS = 30_000
const VIRTUAL_THRESHOLD = 100
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

// ──────────────────────────── URL helpers ─────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"'.!?,)]/g

function extractUrls(text: string): string[] {
  return [...text.matchAll(new RegExp(URL_REGEX.source, "g"))].map((m) => m[0])
}

function linkify(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = new RegExp(URL_REGEX.source, "g")
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[0]
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 opacity-90 hover:opacity-100 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>
}

// ──────────────────────────── OG Preview ─────────────────────────────

interface OgData {
  title: string | null
  description: string | null
  image: string | null
  domain: string
  url: string
}

function OgPreview({ url, isMine }: { url: string; isMine: boolean }) {
  const { data, isLoading } = useQuery<OgData | null>({
    queryKey: ["og", url],
    queryFn: async () => {
      const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`)
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className={cn(
        "mt-1 rounded-xl border overflow-hidden text-xs font-mono animate-pulse",
        isMine ? "border-primary/30 bg-primary/10" : "border-border bg-muted/50"
      )}>
        <div className="h-3 w-24 bg-current opacity-20 m-3 rounded" />
      </div>
    )
  }

  if (!data || (!data.title && !data.image)) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-1 rounded-xl border overflow-hidden block hover:opacity-90 transition-opacity",
        isMine ? "border-primary/30" : "border-border"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {data.image && (
        <img
          src={data.image}
          alt={data.title ?? ""}
          className="w-full max-h-40 object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
        />
      )}
      <div className={cn(
        "px-3 py-2",
        isMine ? "bg-primary/10" : "bg-muted/50"
      )}>
        {data.title && (
          <p className="text-xs font-medium line-clamp-2 leading-snug">{data.title}</p>
        )}
        <p className="text-[10px] opacity-60 font-mono mt-0.5">{data.domain}</p>
      </div>
    </a>
  )
}

// ──────────────────────────── Types ─────────────────────────────

interface MessageType {
  id: string
  sender: string
  text: string
  timestamp: number
  token?: string
  imageId?: string
}

interface PendingMessage {
  localId: string
  text: string
  timestamp: number
  status: "sending" | "failed"
  imageId?: string
}

interface MessageGroup {
  sender: string
  messages: (MessageType | (PendingMessage & { isPending: true }))[]
  isMine: boolean
}

// ──────────────────────────── Message rendering ─────────────────────────────

function formatTimeRemaining(seconds: number) {
  if (seconds < 0) return "∞"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`
  return `0:${s.toString().padStart(2, "0")}`
}

function groupMessages(
  messages: MessageType[],
  pending: PendingMessage[],
  viewerUsername: string
): MessageGroup[] {
  const all: (MessageType | (PendingMessage & { isPending: true; sender: string; id: string }))[] = [
    ...messages,
    ...pending.map((p) => ({ ...p, isPending: true as const, sender: viewerUsername, id: p.localId })),
  ]

  all.sort((a, b) => a.timestamp - b.timestamp)

  const groups: MessageGroup[] = []
  for (const msg of all) {
    const sender = msg.sender
    const last = groups[groups.length - 1]
    if (last && last.sender === sender) {
      last.messages.push(msg as MessageType)
    } else {
      groups.push({ sender, messages: [msg as MessageType], isMine: sender === viewerUsername })
    }
  }
  return groups
}

function ChatImage({ roomId, imageId }: { roomId: string; imageId: string; isMine: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) return null

  return (
    <div className={cn("mt-1 rounded-xl overflow-hidden", !loaded && "min-h-[80px] bg-muted/50 animate-pulse")}>
      <img
        src={`/api/image?roomId=${roomId}&imgId=${imageId}`}
        alt="shared image"
        draggable={false}
        className={cn(
          "w-full max-w-[280px] rounded-xl object-cover transition-opacity select-none",
          loaded ? "opacity-100 cursor-zoom-in" : "opacity-0 absolute"
        )}
        style={{
          maxHeight: "320px",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
          pointerEvents: loaded ? "auto" : "none",
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          const w = window.open("", "_blank")
          if (w) {
            w.document.write(
              `<html><head><title>image</title><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="/api/image?roomId=${roomId}&imgId=${imageId}" /></body></html>`
            )
          }
        }}
      />
    </div>
  )
}

const TWO_MINUTES_MS = 2 * 60 * 1000

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete() }}
      title="Delete message"
      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all active:scale-95"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  )
}

function MessageBubble({
  group,
  roomId,
  onRetry,
  onDelete,
}: {
  group: MessageGroup
  roomId: string
  onRetry?: (msg: PendingMessage) => void
  onDelete?: (messageId: string) => void
}) {
  const lastMsg = group.messages[group.messages.length - 1]
  const lastTimestamp = (lastMsg as MessageType).timestamp

  return (
    <div className={cn("flex flex-col gap-0.5", group.isMine ? "items-end" : "items-start")}>
      <span className="text-[11px] font-mono text-muted-foreground/60 px-1 mb-0.5">
        {group.isMine ? "you" : `@${group.sender}`}
      </span>
      {group.messages.map((msg, i) => {
        const isPending = "isPending" in msg
        const pending = isPending ? (msg as unknown as PendingMessage & { isPending: true }) : null
        const serverMsg = !isPending ? (msg as MessageType) : null
        const urls = extractUrls(msg.text)
        const hasOnlyUrl = msg.text.trim().match(/^https?:\/\/\S+$/)
        const canDelete = group.isMine && !isPending && serverMsg && Date.now() - serverMsg.timestamp <= TWO_MINUTES_MS

        return (
          <div
            key={msg.id ?? (msg as PendingMessage).localId}
            className={cn(
              "w-full group/msg",
              group.isMine ? "flex flex-col items-end" : "flex flex-col items-start"
            )}
          >
            {serverMsg?.imageId && (
              <div className={cn("flex items-end gap-1", group.isMine ? "flex-row-reverse" : "flex-row")}>
                <ChatImage roomId={roomId} imageId={serverMsg.imageId} isMine={group.isMine} />
                {canDelete && onDelete && (
                  <div className="opacity-30 hover:opacity-100 active:opacity-100 transition-opacity mb-1">
                    <DeleteButton onDelete={() => onDelete(serverMsg.id)} />
                  </div>
                )}
              </div>
            )}
            {pending?.imageId && (
              <div className="mt-1 rounded-xl bg-muted/50 animate-pulse min-h-[80px] w-[200px]" />
            )}

            {msg.text && (
              <div className={cn("flex items-end gap-1", group.isMine ? "flex-row-reverse" : "flex-row")}>
                <div
                  className={cn(
                    "max-w-[75vw] sm:max-w-[60%] px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
                    group.isMine
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                      : "bg-muted text-foreground rounded-2xl rounded-bl-sm",
                    i > 0 && group.isMine && "rounded-tr-lg",
                    i > 0 && !group.isMine && "rounded-tl-lg",
                    isPending && "opacity-80"
                  )}
                >
                  {linkify(msg.text)}
                  {isPending && (
                    <span className="inline-flex items-center gap-1 ml-1 align-middle">
                      {pending!.status === "sending" ? (
                        <svg className="w-3 h-3 opacity-60 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeDasharray="31.416" strokeDashoffset="10" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <button
                          onClick={() => onRetry?.(pending!)}
                          title="Tap to retry"
                          className="text-destructive hover:opacity-80"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {canDelete && onDelete && (
                  <div className="opacity-30 hover:opacity-100 active:opacity-100 transition-opacity">
                    <DeleteButton onDelete={() => onDelete(serverMsg!.id)} />
                  </div>
                )}
              </div>
            )}

            {/* OG preview for URLs in server messages */}
            {!isPending && urls.length > 0 && !serverMsg?.imageId && (
              <div className={cn("max-w-[75vw] sm:max-w-[60%]", hasOnlyUrl ? "" : "mt-0.5")}>
                <OgPreview url={urls[0]} isMine={group.isMine} />
              </div>
            )}
          </div>
        )
      })}

      <span className="text-[10px] text-muted-foreground/40 px-1 mt-0.5">
        {format(lastTimestamp, "HH:mm")}
      </span>
    </div>
  )
}

function TypingIndicator({ username }: { username: string }) {
  return (
    <div className="flex items-start">
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[11px] font-mono text-muted-foreground/60 px-1">@{username}</span>
        <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

function PresenceBadge({ status }: { status: "online" | "away" | "offline" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-mono",
      status === "online" ? "text-green-500" : status === "away" ? "text-yellow-500" : "text-muted-foreground/40"
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        status === "online" ? "bg-green-500 animate-pulse" : status === "away" ? "bg-yellow-500" : "bg-muted-foreground/30"
      )} />
      {status}
    </span>
  )
}

// ──────────────────────────── Main component ─────────────────────────────

interface ChatPageProps {
  otherParticipant: string | null
  viewerUsername: string
}

export default function ChatPage({ otherParticipant, viewerUsername }: ChatPageProps) {
  const params = useParams()
  const roomId = params.roomId as string
  const queryClient = useQueryClient()

  const router = useRouter()
  const [isNavigating, startTransition] = useTransition()

  const [input, setInput] = useState("")
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [otherPresence, setOtherPresence] = useState<"online" | "away" | "offline">("offline")
  const [showNewMessages, setShowNewMessages] = useState(false)
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [virtualOffset, setVirtualOffset] = useState(0)
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingImageId, setPendingImageId] = useState<string | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingSentRef = useRef<number>(0)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const presenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAtBottomRef = useRef(true)

  useQuery({
    queryKey: ["ttl", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } })
      setTimeRemaining(res.data?.ttl ?? null)
      return res.data
    },
  })

  useEffect(() => {
    if (timeRemaining === null || timeRemaining < 0) return
    if (timeRemaining === 0) {
      startTransition(() => router.push("/?destroyed=true"))
      return
    }
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timeRemaining, router])

  const { data: messagesData, isLoading: isMessagesLoading } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } })
      return res.data
    },
  })

  const { mutate: sendMessage } = useMutation({
    mutationFn: async ({ text, localId, imageId }: { text: string; localId: string; imageId?: string }) => {
      await client.messages.post({ text, imageId }, { query: { roomId } })
      return localId
    },
    onSuccess: (localId) => {
      setPendingMessages((prev) => prev.filter((m) => m.localId !== localId))
      setPendingImageId(null)
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] })
    },
    onError: (_err, { localId }) => {
      setPendingMessages((prev) =>
        prev.map((m) => m.localId === localId ? { ...m, status: "failed" } : m)
      )
    },
  })

  const { mutate: sendTyping } = useMutation({
    mutationFn: async () => {
      await client.room.typing.post(null, { query: { roomId } })
    },
  })

  const { mutate: sendPresence } = useMutation({
    mutationFn: async (status: "online" | "away") => {
      await client.room.presence.post({ status }, { query: { roomId } })
    },
  })

  const handleTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now
      sendTyping()
    }
  }, [sendTyping])

  useEffect(() => {
    sendPresence("online")
    const interval = setInterval(() => sendPresence("online"), PRESENCE_INTERVAL_MS)
    const onVisibility = () => {
      sendPresence(document.visibilityState === "hidden" ? "away" : "online")
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [sendPresence])

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy", "chat.typing", "chat.presence", "chat.delete"],
    onData: ({ event, data }) => {
      if (event === "chat.message") {
        queryClient.invalidateQueries({ queryKey: ["messages", roomId] })
      }
      if (event === "chat.destroy") {
        startTransition(() => router.push("/?destroyed=true"))
      }
      if (event === "chat.delete") {
        const d = data as { messageId: string }
        setDeletedIds((prev) => new Set([...prev, d.messageId]))
      }
      if (event === "chat.typing") {
        const d = data as { username: string }
        if (d.username !== viewerUsername) {
          setTypingUser(d.username)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000)
        }
      }
      if (event === "chat.presence") {
        const d = data as { username: string; status: "online" | "away" }
        if (d.username !== viewerUsername) {
          if (d.status === "online") {
            setOtherPresence("online")
            if (presenceTimeoutRef.current) clearTimeout(presenceTimeoutRef.current)
            presenceTimeoutRef.current = setTimeout(() => setOtherPresence("away"), AWAY_TIMEOUT_MS)
          } else {
            setOtherPresence("away")
            if (presenceTimeoutRef.current) clearTimeout(presenceTimeoutRef.current)
          }
        }
      }
    },
  })

  const { mutate: destroyRoom, isPending: isDestroying } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } })
    },
    onSuccess: () => setDestroyOpen(false),
  })

  const { mutate: deleteMessage } = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetch(`/api/messages/${messageId}?roomId=${roomId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Delete failed")
    },
  })

  const handleDelete = useCallback((messageId: string) => {
    setDeletedIds((prev) => new Set([...prev, messageId]))
    deleteMessage(messageId)
  }, [deleteMessage])

  const scrollToBottom = useCallback((smooth = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" })
  }, [])

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isAtBottomRef.current = distFromBottom < 80
    if (isAtBottomRef.current) setShowNewMessages(false)
  }, [])

  const allMessages = useMemo(
    () => ((messagesData?.messages ?? []) as MessageType[]).filter((m) => !deletedIds.has(m.id)),
    [messagesData, deletedIds]
  )
  const isVirtualized = allMessages.length > VIRTUAL_THRESHOLD
  const displayedMessages = useMemo(() => {
    if (!isVirtualized) return allMessages
    return allMessages.slice(Math.max(0, allMessages.length - VIRTUAL_THRESHOLD - virtualOffset))
  }, [allMessages, isVirtualized, virtualOffset])
  const hasMoreMessages = isVirtualized && virtualOffset + VIRTUAL_THRESHOLD < allMessages.length

  const groups = useMemo(
    () => groupMessages(displayedMessages, pendingMessages, viewerUsername),
    [displayedMessages, pendingMessages, viewerUsername]
  )

  useEffect(() => {
    if (allMessages.length || pendingMessages.length) {
      if (isAtBottomRef.current) { scrollToBottom(); setShowNewMessages(false) }
      else setShowNewMessages(true)
    }
  }, [allMessages, pendingMessages, scrollToBottom])

  useEffect(() => {
    if (typingUser && isAtBottomRef.current) scrollToBottom(true)
  }, [typingUser, scrollToBottom])

  const doSend = useCallback((text: string, imageId?: string) => {
    if (!text.trim() && !imageId) return
    const localId = nanoid()
    const pending: PendingMessage = {
      localId,
      text: text.trim(),
      timestamp: Date.now(),
      status: "sending",
      imageId,
    }
    setPendingMessages((prev) => [...prev, pending])
    setInput("")
    setPendingImageId(null)
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    isAtBottomRef.current = true
    requestAnimationFrame(() => scrollToBottom())
    sendMessage({ text: text.trim(), localId, imageId })
  }, [sendMessage, scrollToBottom])

  const handleSendMessage = () => doSend(input, pendingImageId ?? undefined)

  const handleRetry = useCallback((msg: PendingMessage) => {
    setPendingMessages((prev) => prev.filter((m) => m.localId !== msg.localId))
    doSend(msg.text, msg.imageId)
  }, [doSend])

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val.slice(0, MAX_CHARS))
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px"
    if (val.length <= MAX_CHARS) handleTyping()
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!e.target) return
    e.target.value = ""
    if (!file) return

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Image too large (max 3 MB)")
      return
    }

    setUploadError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/upload?roomId=${roomId}`, { method: "POST", body: formData, credentials: "include" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUploadError(data.error ?? "Upload failed")
        return
      }
      const { imgId } = await res.json()
      // Immediately send the image as a message
      doSend("", imgId)
    } catch {
      setUploadError("Upload failed. Try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const charCount = input.length
  const isAtLimit = charCount >= MAX_CHARS
  const showCharCount = charCount >= WARN_CHARS
  const canSend = (input.trim().length > 0) && !isUploading

  return (
    <main className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground">
      {isNavigating && <Loading overlay message="Leaving room..." />}

      {/* Header */}
      <header className="shrink-0 border-b px-3 py-2 flex items-center justify-between bg-background gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => startTransition(() => router.push("/dashboard"))}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold font-mono text-sm truncate">
                {otherParticipant ? `@${otherParticipant}` : "private room"}
              </span>
              <PresenceBadge status={otherPresence} />
            </div>
            {timeRemaining !== null && (
              <span className={cn(
                "text-[10px] font-mono",
                timeRemaining >= 0 && timeRemaining < 300 ? "text-destructive" : "text-muted-foreground/50"
              )}>
                {timeRemaining === -1 ? "no expiry" : `expires in ${formatTimeRemaining(timeRemaining)}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="w-[48px]"><ThemeColorToggle /></div>
          <AnimatedThemeToggler />
          <Dialog open={destroyOpen} onOpenChange={setDestroyOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label="Destroy room">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle className="font-mono">destroy this room?</DialogTitle>
                <DialogDescription>All messages and images will be permanently deleted. This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDestroyOpen(false)} disabled={isDestroying} className="font-mono text-xs">cancel</Button>
                <Button variant="destructive" onClick={() => destroyRoom()} disabled={isDestroying} className="font-mono text-xs">
                  {isDestroying ? "destroying..." : "yes, destroy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-3"
      >
        {hasMoreMessages && (
          <div className="text-center pb-1">
            <button
              onClick={() => setVirtualOffset((v) => v + VIRTUAL_THRESHOLD)}
              className="text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1.5 transition-colors"
            >
              load earlier messages
            </button>
          </div>
        )}

        {isMessagesLoading && (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                <div className={cn("h-8 rounded-2xl bg-muted animate-pulse", i % 2 === 0 ? "w-28" : "w-40")} />
              </div>
            ))}
          </div>
        )}

        {!isMessagesLoading && allMessages.length === 0 && pendingMessages.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-[40vh]">
            <p className="text-muted-foreground/40 text-sm font-mono text-center px-4">
              no messages yet — say hello!
            </p>
          </div>
        )}

        {groups.map((group, i) => (
          <MessageBubble
            key={`${group.sender}-${i}`}
            group={group}
            roomId={roomId}
            onRetry={handleRetry}
            onDelete={handleDelete}
          />
        ))}

        {typingUser && <TypingIndicator username={typingUser} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Jump-to-bottom pill */}
      {showNewMessages && (
        <button
          onClick={() => {
            isAtBottomRef.current = true
            scrollToBottom(true)
            setShowNewMessages(false)
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground text-xs font-mono px-3 py-1.5 rounded-full shadow-lg hover:bg-primary/90 transition-all"
        >
          ↓ new messages
        </button>
      )}

      {/* Input */}
      <div className="shrink-0 border-t bg-background px-3 py-2">
        {uploadError && (
          <p className="text-xs text-destructive font-mono mb-1.5 text-center">{uploadError}</p>
        )}
        <div className="flex items-end gap-2">
          {/* Image upload button */}
          <button
            onClick={() => { setUploadError(null); fileInputRef.current?.click() }}
            disabled={isUploading}
            className="shrink-0 mb-0.5 w-9 h-9 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send image"
            title="Send image"
          >
            {isUploading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="31.416" strokeDashoffset="10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder="message..."
              rows={1}
              autoFocus
              className={cn(
                "w-full resize-none overflow-hidden rounded-2xl border bg-background px-4 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary transition-colors",
                isAtLimit && "ring-1 ring-destructive border-destructive"
              )}
              style={{ minHeight: "40px", maxHeight: "120px" }}
            />
            {showCharCount && (
              <span className={cn(
                "absolute right-3 bottom-2 text-[10px] font-mono pointer-events-none",
                isAtLimit ? "text-destructive font-bold" : "text-muted-foreground/50"
              )}>
                {MAX_CHARS - charCount} left
              </span>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={!canSend}
            className="shrink-0 mb-0.5 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/30 font-mono text-center mt-1">
          enter to send · shift+enter for new line
        </p>
      </div>
    </main>
  )
}
