"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BrainIcon, Check, Loader2Icon, PencilIcon, Trash2Icon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useSession } from "@/stores/session";
import { useAiMemory, useAiMemoryMutations } from "@/hooks/use-ai-memory";
import { errorMessage } from "@/lib/api";
import type { MemoryCategory, MemoryFact } from "@/types/ai-memory";

const CATEGORY_TITLES: Record<MemoryCategory, string> = {
  owner: "About you",
  pet: "Your pets",
  vendor: "Vendors & services",
  health: "Health notes",
};
const CATEGORY_ORDER: MemoryCategory[] = ["owner", "pet", "vendor", "health"];

function humanize(key: string): string {
  const s = key.replace(/([A-Z])/g, " $1").replace(/[._-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border sm:p-6">
      <h2 className="text-lg">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FactRow({ fact, label, onSave, onDelete, busy }: { fact: MemoryFact; label: string; onSave: (value: string) => void; onDelete: () => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(fact.factValue);

  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-9" aria-label={`Edit ${label}`} autoFocus />
            <Button type="button" size="icon" variant="ghost" aria-label="Save" disabled={busy || !value.trim()} onClick={() => { onSave(value.trim()); setEditing(false); }}>
              <Check className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => { setValue(fact.factValue); setEditing(false); }}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="mt-0.5 text-[15px] break-words">{fact.factValue}</p>
        )}
      </div>
      {!editing && (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${label}`} onClick={() => setEditing(true)} disabled={busy}>
            <PencilIcon className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${label}`} onClick={onDelete} disabled={busy}>
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      )}
    </li>
  );
}

export function AiMemoryScreen() {
  const { pets } = useSession();
  const q = useAiMemory();
  const { setEnabled, setHealthSummary, updateFact, deleteFact, clearAll } = useAiMemoryMutations();
  const [confirmClear, setConfirmClear] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);

  const petNameById = useMemo(() => new Map((pets ?? []).map((p) => [p.id, p.name])), [pets]);

  const grouped = useMemo(() => {
    const map = new Map<MemoryCategory, MemoryFact[]>();
    for (const f of q.data?.facts ?? []) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [q.data]);

  const factLabel = (f: MemoryFact): string => {
    if (f.category === "pet") {
      const [nameSlug, field] = f.factKey.split(".");
      const name = (f.petId && petNameById.get(f.petId)) || humanize(nameSlug);
      return `${name} · ${humanize(field ?? "")}`;
    }
    if (f.category === "vendor") return "Vendor";
    if (f.category === "health") return "Health note";
    return humanize(f.factKey);
  };

  const busy = updateFact.isPending || deleteFact.isPending || clearAll.isPending;
  const enabled = q.data?.enabled ?? true;

  return (
    <>
      <PageHeader eyebrow="Privacy" title="What Pawtella AI remembers" description="Context the assistant keeps so it can help you and your pets better over time." />

      {q.isLoading ? (
        <div className="space-y-5">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load your AI memory" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="flex flex-col gap-5">
          <Section title="Memory">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-[15px] font-semibold">Let Pawtella AI remember</span>
                <span className="block text-sm text-muted-foreground">
                  When on, the assistant saves helpful details from your chats (your preferences, your pets, vendors you mention and health topics). Your order history is read live and never copied here, and payment details and passwords are never stored. When off, nothing new is saved and saved memory is not used.
                </span>
              </span>
              <Switch
                checked={enabled}
                disabled={setEnabled.isPending}
                onCheckedChange={(v) => {
                  setEnabled.mutate(Boolean(v), { onError: (err) => toast.error(errorMessage(err)) });
                }}
              />
            </label>
          </Section>

          <Section title="Health history" description="A short summary of health questions you've asked and what was suggested.">
            <Textarea
              rows={3}
              placeholder="Nothing saved yet."
              value={summaryDraft ?? q.data?.healthSummary ?? ""}
              onChange={(e) => setSummaryDraft(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              {summaryDraft !== null && (
                <Button type="button" variant="ghost" onClick={() => setSummaryDraft(null)} disabled={setHealthSummary.isPending}>
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                disabled={setHealthSummary.isPending || summaryDraft === null}
                onClick={() =>
                  setHealthSummary.mutate(summaryDraft ?? "", {
                    onSuccess: () => {
                      setSummaryDraft(null);
                      toast.success("Saved");
                    },
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                {setHealthSummary.isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                Save summary
              </Button>
            </div>
          </Section>

          {CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0).map((category) => (
            <Section key={category} title={CATEGORY_TITLES[category]}>
              <ul className="divide-y divide-border">
                {grouped.get(category)!.map((fact) => (
                  <FactRow
                    key={fact.id}
                    fact={fact}
                    label={factLabel(fact)}
                    busy={busy}
                    onSave={(value) => updateFact.mutate({ id: fact.id, value }, { onError: (err) => toast.error(errorMessage(err)) })}
                    onDelete={() => deleteFact.mutate(fact.id, { onError: (err) => toast.error(errorMessage(err)) })}
                  />
                ))}
              </ul>
            </Section>
          ))}

          {(q.data?.facts.length ?? 0) === 0 && !q.data?.healthSummary && (
            <Section title="Saved details">
              <EmptyState
                icon={<BrainIcon />}
                title="Nothing remembered yet"
                description={enabled ? "As you chat with the assistant, helpful details will show up here for you to review or remove." : "Memory is off, so nothing is being saved."}
              />
            </Section>
          )}

          <Section title="Danger zone">
            <div className="flex flex-col gap-3">
              <Button variant="destructive" className="w-full justify-start" onClick={() => setConfirmClear(true)} disabled={busy}>
                <Trash2Icon data-icon="inline-start" /> Forget everything
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Permanently deletes everything the assistant remembers about you and your pets. Your chat messages and orders are not affected. Deleting your account also removes all of this.
              </p>
            </div>
          </Section>
        </div>
      )}

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="rounded-card">
          <DialogHeader>
            <DialogTitle>Forget everything?</DialogTitle>
            <DialogDescription>This clears every saved detail and the health summary. It can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={clearAll.isPending}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearAll.isPending}
              onClick={() =>
                clearAll.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmClear(false);
                    setSummaryDraft(null);
                    toast.success("Memory cleared");
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              {clearAll.isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Forget everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
