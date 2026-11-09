"use client";

import { LightMarkdown } from "@/components/light-markdown";
import { PawIcon } from "@/components/logo";
import { cn } from "@/lib/utils";
import type { ChatMessage, ReplyEnvelope, UserContentBlock } from "@/types/ai";
import type { Pet } from "@/types/pet";
import { PartnerCards, ProductChips, ProfileUpdateCard, VetAlertCard } from "./envelope-cards";

function isEnvelope(c: ChatMessage["content"]): c is ReplyEnvelope {
  return !!c && !Array.isArray(c) && typeof c === "object";
}

export function UserBubble({ blocks, className }: { blocks: UserContentBlock[]; className?: string }) {
  const image = blocks.find((b) => b.type === "image");
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return (
    <div className={cn("flex justify-end", className)}>
      <div className="max-w-[85%] space-y-2 sm:max-w-[70%]">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt="Attached" className="ml-auto max-h-64 rounded-card object-cover ring-1 ring-border" />
        )}
        {text && (
          <div className="rounded-card rounded-tr-md bg-coral-soft px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground ring-1 ring-primary/15">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

export function AssistantCard({ reply, pet, className }: { reply: ReplyEnvelope; pet: Pet | null; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <PawIcon className="size-4" />
      </span>
      <div className="min-w-0 max-w-[92%] flex-1 space-y-3 sm:max-w-[80%]">
        {reply.vetAlert && <VetAlertCard alert={reply.vetAlert} />}
        <div className="rounded-card rounded-tl-md bg-accent px-4 py-3 ring-1 ring-border">
          <LightMarkdown text={reply.text} />
        </div>
        {reply.productSuggestions && reply.productSuggestions.length > 0 && <ProductChips products={reply.productSuggestions} />}
        {reply.petProfileUpdates && <ProfileUpdateCard updates={reply.petProfileUpdates} pet={pet} />}
        {reply.partnerResults && reply.partnerResults.length > 0 && <PartnerCards partners={reply.partnerResults} />}
      </div>
    </div>
  );
}

export function MessageItem({ message, pet }: { message: ChatMessage; pet: Pet | null }) {
  if (message.role === "assistant" && isEnvelope(message.content)) return <AssistantCard reply={message.content} pet={pet} />;
  if (Array.isArray(message.content)) return <UserBubble blocks={message.content} />;
  return null;
}
