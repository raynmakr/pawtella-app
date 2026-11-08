"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/auth/form-field";
import { useReport } from "@/hooks/use-social";
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from "@/types/social";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: number;
  /** Shown in the description, e.g. "@luna_the_lab's post". */
  label?: string;
}

export function ReportDialog({ open, onOpenChange, targetType, targetId, label }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const report = useReport();

  const submit = async () => {
    if (!reason) {
      setError("Pick a reason");
      return;
    }
    setError(null);
    await report.mutateAsync({ targetType, targetId, reason, details: details.trim() || undefined });
    onOpenChange(false);
    setReason(null);
    setDetails("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Report {label ?? `this ${targetType}`}</DialogTitle>
          <DialogDescription>Tell us what&apos;s wrong. Reports are anonymous and reviewed by the Pawtella team.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <FormField label="Reason" htmlFor="report-reason" error={error ?? undefined}>
            <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)} items={REPORT_REASONS}>
              <SelectTrigger id="report-reason" className="w-full" aria-invalid={!!error}>
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Details (optional)" htmlFor="report-details">
            <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Anything that helps us understand" rows={3} />
          </FormField>
        </div>
        <DialogFooter className="rounded-b-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={report.isPending}>
            {report.isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
