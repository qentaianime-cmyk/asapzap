"use client"

import { useAuth } from "@/hooks/use-auth"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Loading } from "@/components/ui/loading"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const WORDMARK = [">", "a", "s", "p", "z", "a", "p"]

const MARQUEE_ITEMS = [
  "PRIVATE ROOMS",
  "REAL-TIME CHAT",
  "SELF-DESTRUCTS",
  "SOCIAL GRAPH",
  "ZERO TRACES",
  "LINK PREVIEWS",
  "IMAGE SHARING",
  "PARTICIPANT ONLY",
]

function MarqueeTrack() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div className="border-y border-border/60 py-3 overflow-hidden select-none">
      <div className="flex gap-0 animate-[marquee_25s_linear_infinite]">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-6 shrink-0 pr-6">
            <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-muted-foreground/50 uppercase whitespace-nowrap">
              {item}
            </span>
            <span className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

const Page = () => (
  <Suspense>
    <LandingPage />
  </Suspense>
)

export default Page

function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isNavigating, startTransition] = useTransition()

  const containerRef = useRef<HTMLDivElement>(null)
  const taglineRef = useRef<HTMLParagraphElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const wasDestroyed = searchParams.get("destroyed") === "true"
  const error = searchParams.get("error")
  const searchParamsString = searchParams.toString()

  useEffect(() => {
    if (!searchParamsString) return
    timerRef.current = setTimeout(() => router.replace("/"), 5000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [searchParamsString, router])

  useEffect(() => {
    let lenis: import("lenis").default | null = null

    async function init() {
      const { default: Lenis } = await import("lenis")
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      })
      function raf(time: number) {
        lenis!.raf(time)
        ScrollTrigger.update()
        requestAnimationFrame(raf)
      }
      requestAnimationFrame(raf)
    }

    init()

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } })

      // tagline slides up from below its overflow-hidden wrapper
      tl.to(taglineRef.current, { y: "0%", duration: 0.8 }, 0.1)

      // wordmark — each character slides up with stagger (cinematic)
      tl.to(".hero-char", { y: "0%", duration: 1.1, stagger: 0.055 }, 0.35)

      // subtitle slides up
      tl.to(subtitleRef.current, { y: "0%", duration: 0.9 }, 0.75)

      // CTA fades in (opacity only — avoids height-based layout shift)
      tl.to(ctaRef.current, { opacity: 1, duration: 0.7 }, 1.05)

      // scroll-reveal sections
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(el,
          { opacity: 0, y: 32 },
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          }
        )
      })

      gsap.utils.toArray<HTMLElement>("[data-reveal-line]").forEach((el) => {
        gsap.fromTo(
          el,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 1.2,
            ease: "power4.inOut",
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          }
        )
      })
    }, containerRef)

    return () => {
      ctx.revert()
      lenis?.destroy()
    }
  }, [])

  return (
    <div ref={containerRef} className="w-full">
      {isNavigating && <Loading overlay message="Navigating..." />}

      {(wasDestroyed || error) && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 cursor-pointer"
          onClick={() => router.replace("/")}
        >
          <div className="relative overflow-hidden bg-destructive/10 border border-destructive/40 px-5 py-3 rounded-xl text-center hover:bg-destructive/15 transition-colors backdrop-blur-md">
            <p className="text-destructive text-xs font-bold font-mono">
              {wasDestroyed ? "ROOM DESTROYED" :
                error === "room-not-found" ? "ROOM NOT FOUND" :
                  error === "unauthorized" ? "ACCESS DENIED" : "ERROR"}
            </p>
            <div className="warning-progress-bar mt-1" />
          </div>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-center px-6 sm:px-12 overflow-hidden">
        {/* ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_-10%,oklch(var(--primary)/0.06),transparent)] pointer-events-none" />
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[100px] pointer-events-none" />

        <div className="relative z-10 max-w-6xl w-full mx-auto">

          {/* tagline — overflow-hidden + starts at translateY(100%) */}
          <div className="overflow-hidden mb-5">
            <p
              ref={taglineRef}
              className="text-xs font-mono tracking-[0.25em] text-primary uppercase"
              style={{ transform: "translateY(110%)" }}
            >
              <span className="mr-3 inline-block w-4 h-px bg-primary align-middle" />
              private · ephemeral · real-time
            </p>
          </div>

          {/* wordmark — each char in its own overflow-hidden wrapper */}
          <div className="mb-8 flex items-baseline" style={{ lineHeight: 0.9 }}>
            {WORDMARK.map((char, i) => (
              <div key={i} className="overflow-hidden leading-none">
                <span
                  className={`hero-char inline-block font-black tracking-tighter${char === ">" ? " text-primary" : ""}`}
                  style={{
                    fontSize: "clamp(4.5rem, 15vw, 13rem)",
                    transform: "translateY(110%)",
                    display: "inline-block",
                    lineHeight: 1,
                  }}
                >
                  {char}
                </span>
              </div>
            ))}
          </div>

          {/* subtitle — overflow-hidden + starts below */}
          <div className="overflow-hidden mb-10 max-w-xl">
            <p
              ref={subtitleRef}
              className="text-base sm:text-xl text-muted-foreground leading-relaxed"
              style={{ transform: "translateY(110%)" }}
            >
              Rooms that vanish. Chats that stay between you and them.
              No logs. No spectators. No drama.
            </p>
          </div>

          {/* CTA — always has height so auth-load doesn't cause layout shift */}
          <div
            ref={ctaRef}
            className="flex flex-wrap gap-3"
            style={{ opacity: 0, minHeight: "3rem" }}
          >
            {!isLoading && (
              isAuthenticated ? (
                <>
                  <Button
                    size="lg"
                    className="font-mono rounded-xl px-8"
                    onClick={() => startTransition(() => router.push("/dashboard"))}
                  >
                    go to dashboard
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="font-mono rounded-xl"
                    onClick={() => startTransition(() => router.push("/search"))}
                  >
                    find people
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/register">
                    <Button size="lg" className="font-mono rounded-xl px-8">
                      get started — free
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="outline" size="lg" className="font-mono rounded-xl">
                      sign in
                    </Button>
                  </Link>
                </>
              )
            )}
          </div>
        </div>

        {/* scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-25">
          <div className="w-px h-10 bg-foreground animate-[pulse_2s_ease-in-out_infinite]" />
          <span className="text-[9px] font-mono tracking-widest uppercase">scroll</span>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <MarqueeTrack />

      {/* ── FEATURE MANIFESTO ── */}
      <section className="py-24 sm:py-36 px-6 sm:px-12">
        <div className="max-w-6xl mx-auto space-y-24 sm:space-y-32">

          <div
            data-reveal
            style={{ opacity: 0, transform: "translateY(32px)" }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-20 items-start"
          >
            <div>
              <p className="text-[10px] font-mono tracking-[0.3em] text-primary mb-5 uppercase">01 — Privacy</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Only invited.<br />Never witnessed.
              </h2>
            </div>
            <div className="lg:pt-14">
              <p className="text-muted-foreground leading-[1.8] text-base sm:text-lg">
                Every room is locked to exactly two participants.
                No admin eyes. No export function. No archived history.
                When the room expires, it&apos;s gone — cryptographically.
              </p>
            </div>
          </div>

          <div data-reveal-line className="h-px bg-border origin-left" />

          <div
            data-reveal
            style={{ opacity: 0, transform: "translateY(32px)" }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-20 items-start"
          >
            <div>
              <p className="text-[10px] font-mono tracking-[0.3em] text-primary mb-5 uppercase">02 — Ephemerality</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Set a timer.<br />Watch it vanish.
              </h2>
            </div>
            <div className="lg:pt-14">
              <p className="text-muted-foreground leading-[1.8] text-base sm:text-lg">
                1 hour, 6 hours, a day — or persistent until you decide otherwise.
                Real-time delivery, typing indicators, presence. The moment it ends,
                every message, image, and link is purged.
              </p>
            </div>
          </div>

          <div data-reveal-line className="h-px bg-border origin-left" />

          <div
            data-reveal
            style={{ opacity: 0, transform: "translateY(32px)" }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-20 items-start"
          >
            <div>
              <p className="text-[10px] font-mono tracking-[0.3em] text-primary mb-5 uppercase">03 — Social layer</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Follow.<br />Then talk.
              </h2>
            </div>
            <div className="lg:pt-14">
              <p className="text-muted-foreground leading-[1.8] text-base sm:text-lg">
                Build your circle first. Rooms only open between people who mutually know each other.
                No cold DMs. No randoms. Only people you&apos;ve chosen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        data-reveal
        style={{ opacity: 0, transform: "translateY(32px)" }}
        className="relative py-28 sm:py-40 px-6 sm:px-12 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_50%,oklch(var(--primary)/0.05),transparent)] pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          <h2
            className="font-black tracking-tighter leading-tight"
            style={{ fontSize: "clamp(2.5rem, 7vw, 5.5rem)" }}
          >
            {isAuthenticated ? "Your next room awaits." : "No email. No phone. Just start."}
          </h2>
          {!isAuthenticated ? (
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/register">
                <Button size="lg" className="font-mono rounded-xl px-10 text-base">
                  create account — free
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" className="font-mono rounded-xl px-10 text-base">
                  sign in
                </Button>
              </Link>
            </div>
          ) : (
            <Button
              size="lg"
              className="font-mono rounded-xl px-10 text-base"
              onClick={() => startTransition(() => router.push("/dashboard"))}
            >
              go to dashboard
            </Button>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/60 py-6 px-6 sm:px-12 flex items-center justify-between">
        <span className="font-black font-mono text-sm">
          <span className="text-primary">{">"}</span>aspzap
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider uppercase">
          private · self-destructing · real-time
        </span>
      </footer>
    </div>
  )
}
