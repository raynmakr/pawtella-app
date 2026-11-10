"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HistoryIcon, MessageCircleHeartIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { PetChips } from "@/components/pet-chips";
import { toast } from "sonner";
import { useSession } from "@/stores/session";
import { useKeyboardOpen } from "@/stores/keyboard";
import { useConversation, useSendMessage } from "@/hooks/use-chat";
import { useAiMemory, useAiMemoryMutations } from "@/hooks/use-ai-memory";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ChatLocation } from "@/types/ai";
import { Composer } from "./composer";
import { ConversationList } from "./conversation-list";
import { TypingIndicator } from "./envelope-cards";
import { MessageItem, UserBubble } from "./message-bubble";

function suggestedPrompts(petName: string | null, species: string | null) {
  const name = petName ?? "my pet";
  return [
    `Is it normal that ${name} sleeps most of the day?`,
    species === "cat" ? "What should a 4-month-old kitten eat?" : "What should a 4-month-old puppy eat?",
    "Find a groomer near me",
    `${name} has been scratching a lot lately. What could it be?`,
  ];
}

export function ChatScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { pets, primaryPet } = useSession();
  const initialConv = params.get("c") ? Number(params.get("c")) : null;
  const [conversationId, setConversationId] = useState<number | null>(Number.isFinite(initialConv) ? initialConv : null);
  /** User's explicit pet choice; undefined = follow the conversation / primary pet. */
  const [petOverride, setPetOverride] = useState<number | null | undefined>(undefined);
  const [location, setLocation] = useState<ChatLocation | null>(null);
  const [text, setText] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [consentDismissed, setConsentDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // On mobile the keyboard is detected primarily via focus (iOS Safari lies about
  // viewport height). While it's open the whole chat becomes a fixed overlay pinned
  // to the real visible area via the --viewport-* CSS vars, with the bottom nav and
  // floating + hidden, so the composer sits just above the keyboard and the list
  // takes the rest.
  const keyboardOpen = useKeyboardOpen();

  const memory = useAiMemory();
  const { setHealthConsent } = useAiMemoryMutations();
  const showHealthConsent = Boolean(memory.data?.enabled) && memory.data?.healthConsent === false && !consentDismissed;

  const conv = useConversation(conversationId);
  const { send, retry, dismiss, pending } = useSendMessage((id) => {
    setConversationId(id);
    router.replace(`/ask?c=${id}`, { scroll: false });
  });

  // Pet: explicit choice, else the open conversation's pet, else the primary pet.
  const petId: number | null =
    petOverride !== undefined
      ? petOverride
      : conversationId && conv.data
        ? conv.data.conversation.petId ?? null
        : primaryPet?.id ?? null;

  const selectConversation = useCallback(
    (id: number | null) => {
      setConversationId(id);
      setPetOverride(undefined);
      dismiss();
      setListOpen(false);
      router.replace(id ? `/ask?c=${id}` : "/ask", { scroll: false });
    },
    [router, dismiss],
  );

  const pet = useMemo(() => pets.find((p) => p.id === petId) ?? null, [pets, petId]);
  const messages = conversationId ? conv.data?.messages ?? [] : [];
  const isEmpty = !conversationId && !pending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, pending?.status, keyboardOpen]);

  const handleSend = async (p: { message: string; imageUrl: string | null; location: ChatLocation | null }) => {
    await send({ conversationId, petId, message: p.message, imageUrl: p.imageUrl, location: p.location });
  };

  const list = <ConversationList activeId={conversationId} onSelect={selectConversation} />;

  return (
    <div
      className={cn(
        "flex flex-col md:static md:h-[calc(100dvh-5rem)] md:flex-row md:gap-6 md:bg-transparent md:px-0 md:pt-0",
        keyboardOpen
          ? // Fixed overlay pinned to the visual viewport (top + height from CSS vars the
            // KeyboardListener keeps in sync) so iOS can't slide the composer under the keyboard.
            "fixed inset-x-0 z-40 bg-background px-4 pt-2 pb-2 sm:px-6"
          : "h-[calc(100dvh-9.75rem)]",
      )}
      style={keyboardOpen ? { top: "var(--viewport-offset-top, 0px)", height: "var(--viewport-height, 100dvh)" } : undefined}
    >
      <aside className="hidden w-64 shrink-0 md:block">{list}</aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={cn("flex items-center gap-2 pb-2", keyboardOpen && "hidden")}>
          <div className="min-w-0 flex-1">
            <PetChips pets={pets} value={petId} onChange={setPetOverride} noneLabel="General" />
          </div>
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setListOpen(true)} aria-label="Chat history">
            <HistoryIcon data-icon="inline-start" /> Chats
          </Button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto rounded-card bg-card/60 ring-1 ring-border">
          <div className="flex min-h-full flex-col gap-4 p-3 sm:p-5">
            {conversationId && conv.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="ml-auto h-12 w-2/3 rounded-card" />
                <Skeleton className="h-24 w-4/5 rounded-card" />
                <Skeleton className="ml-auto h-12 w-1/2 rounded-card" />
              </div>
            ) : conversationId && conv.isError ? (
              <ErrorState title="Couldn't load this chat" error={conv.error} onRetry={() => void conv.refetch()} retrying={conv.isFetching} />
            ) : isEmpty ? (
              <EmptyChat petName={pet?.name ?? primaryPet?.name ?? null} species={pet?.species ?? null} onPick={setText} />
            ) : (
              messages.map((m) => <MessageItem key={m.id} message={m} pet={pet} />)
            )}

            {pending && (
              <>
                <UserBubble
                  blocks={[
                    ...(pending.input.imageUrl ? [{ type: "image" as const, url: pending.input.imageUrl }] : []),
                    ...(pending.input.message ? [{ type: "text" as const, text: pending.input.message }] : []),
                  ]}
                  className={cn(pending.status !== "sending" && "opacity-70")}
                />
                {pending.status === "sending" ? (
                  <div className="flex items-start">
                    <TypingIndicator />
                  </div>
                ) : (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
                    <span className="text-foreground">{pending.error}</span>
                    <span className="flex gap-1.5">
                      <Button size="sm" onClick={() => void retry()}>
                        <RotateCcwIcon data-icon="inline-start" /> Retry
                      </Button>
                      <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
                        <XIcon />
                      </Button>
                    </span>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className={cn(keyboardOpen ? "pt-2" : "pt-3")}>
          {showHealthConsent && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-card border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 text-foreground/90">
                Let Pawtella remember {pet?.name ?? "your pet"}&apos;s health details (allergies, conditions, meds) to personalize answers? You can change this anytime in Settings.
              </span>
              <span className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  disabled={setHealthConsent.isPending}
                  onClick={() =>
                    setHealthConsent.mutate(true, {
                      onSuccess: () => toast.success("Health memory on"),
                      onError: (err) => toast.error(errorMessage(err)),
                    })
                  }
                >
                  Enable
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConsentDismissed(true)}>
                  Not now
                </Button>
              </span>
            </div>
          )}
          <Composer
            disabled={pending?.status === "sending"}
            onSend={handleSend}
            location={location}
            onLocationChange={setLocation}
            text={text}
            onTextChange={setText}
            large={isEmpty && !keyboardOpen}
            placeholder={pet ? `Ask about ${pet.name}…` : "Ask anything about pets…"}
          />
          <p className={cn("mt-1.5 px-2 text-center text-[11px] leading-relaxed text-muted-foreground", keyboardOpen && "hidden")}>
            Pawtella AI shares general info, not veterinary advice. In an emergency, contact a vet right away.
          </p>
        </div>
      </section>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Your chats</SheetTitle>
            <SheetDescription>Pick up where you left off.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">{list}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmptyChat({ petName, species, onPick }: { petName: string | null; species: string | null; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
      <div className="mb-4 flex size-20 items-center justify-center rounded-3xl bg-coral-soft text-primary">
        <MessageCircleHeartIcon className="size-10" />
      </div>
      <h2 className="text-xl">Ask about {petName ?? "your pet"}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Health, habits, food and what to buy. Answers that know {petName ?? "your pet"}&apos;s profile.
      </p>
      <div className="mt-5 flex max-w-md flex-wrap justify-center gap-2">
        {suggestedPrompts(petName, species).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full bg-card px-3.5 py-2 text-sm font-medium ring-1 ring-border transition hover:ring-primary/40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
