import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Inbox,
  Leaf,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import type { EditableProposalFields, Proposal, ProposalLineItem } from "@shared/types";

const SAMPLE_FORM = {
  customerName: "Olivia Ramirez",
  customerEmail: "olivia.ramirez@example.com",
  customerPhone: "(602) 555-0148",
  projectAddress: "4821 E Desert Vista Trail, Phoenix, AZ 85044",
  projectType: "Paver patio, pergola & desert landscape refresh",
  desiredStartDate: "Within 6–8 weeks",
  budgetRange: "$35,000–$50,000",
  siteNotes: `Backyard is roughly 54' wide by 38' deep. Client wants to replace the cracked 420 sq ft concrete pad with about 560 sq ft of large-format light travertine-look pavers, including a curved edge toward the pool. Existing concrete needs demolition and haul-away.\n\nAdd a 12' x 16' attached alumawood pergola in a dark bronze finish with two fan-ready electrical boxes. Exact ledger attachment and engineering need confirmation. Keep 4' clear from the pool edge.\n\nRefresh the west planter: approximately 180 sq ft, remove old gravel and two dead shrubs, install low-water desert planting, new 1/4-inch minus granite, and extend the existing drip zone. Add six low-voltage path lights.\n\nCustomer mentioned HOA approval is required. Side gate is 42 inches wide. Access is otherwise straightforward. She wants the entertaining area ready before a graduation party in late November. Existing irrigation controller stays. Pool work, furniture, and fans are not included.`,
};

const EMPTY_FORM = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  projectAddress: "",
  projectType: "",
  desiredStartDate: "",
  budgetRange: "",
  siteNotes: "",
};

type FormState = typeof EMPTY_FORM;

type MetricProps = {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
};

function Metric({ label, value, helper, icon: Icon }: MetricProps) {
  return (
    <Card className="metric-card border-0 p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/8 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-2 block text-xs font-semibold text-foreground/75">{label}</Label>
      {children}
    </div>
  );
}

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function relativeTime(value: Date) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString();
}

function toEditable(proposal: Proposal): EditableProposalFields {
  return {
    projectSummary: proposal.projectSummary,
    lineItems: proposal.lineItems,
    assumptions: proposal.assumptions,
    exclusions: proposal.exclusions,
    unansweredQuestions: proposal.unansweredQuestions,
    riskFlags: proposal.riskFlags,
    customerMessage: proposal.customerMessage,
  };
}

function ProposalListItem({ proposal, active, onClick }: { proposal: Proposal; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`proposal-row w-full rounded-xl p-3 text-left transition-all ${active ? "active" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${proposal.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {proposal.status === "approved" ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold">{proposal.customerName}</p>
            <span className="text-xs font-semibold tabular-nums">{dollars(proposal.totalCents)}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{proposal.projectType}</p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{proposal.status === "approved" ? "Approved" : "Needs review"}</span>
            <span>{relativeTime(proposal.updatedAt)}</span>
          </div>
        </div>
        <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground/50" />
      </div>
    </button>
  );
}

function NewProposalForm({ onGenerated }: { onGenerated: (proposal: Proposal) => void }) {
  const [form, setForm] = useState<FormState>(SAMPLE_FORM);
  const utils = trpc.useUtils();
  const mutation = trpc.proposal.generate.useMutation({
    onSuccess: async proposal => {
      await utils.proposal.list.invalidate();
      onGenerated(proposal);
      toast.success("Draft created and persisted", { description: "AI scope and guardrails are ready for review." });
    },
    onError: error => toast.error("Could not create proposal", { description: error.message }),
  });

  const set = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> New proposal
          </Badge>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Turn the site walk into a decision.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Capture what Marcus saw. QuoteFlow will structure the scope, surface unknowns, and prepare a reviewable draft—not send it.
          </p>
        </div>
        <Button variant="outline" onClick={() => setForm(SAMPLE_FORM)}>
          <RefreshCw className="mr-2 h-4 w-4" /> Restore demo notes
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card className="border-0 p-5 shadow-soft">
          <p className="section-kicker">Client & project</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Customer name"><Input value={form.customerName} onChange={e => set("customerName", e.target.value)} /></Field>
            <Field label="Project type"><Input value={form.projectType} onChange={e => set("projectType", e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} /></Field>
            <Field label="Phone"><Input value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)} /></Field>
            <Field label="Project address" className="sm:col-span-2"><Input value={form.projectAddress} onChange={e => set("projectAddress", e.target.value)} /></Field>
            <Field label="Desired start"><Input value={form.desiredStartDate} onChange={e => set("desiredStartDate", e.target.value)} /></Field>
            <Field label="Budget range"><Input value={form.budgetRange} onChange={e => set("budgetRange", e.target.value)} /></Field>
          </div>
          <div className="mt-6 rounded-xl bg-secondary/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">No autonomous sending</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Every draft is stored, checked, and held for Marcus’s approval. High-severity flags block approval.</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-0 p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Site-walk notes</p>
              <p className="mt-2 text-sm text-muted-foreground">Messy is fine. Include dimensions, materials, access, client priorities, and anything uncertain.</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{form.siteNotes.length.toLocaleString()} chars</span>
          </div>
          <Textarea
            value={form.siteNotes}
            onChange={e => set("siteNotes", e.target.value)}
            className="mt-4 min-h-[350px] resize-y leading-6"
            placeholder="Paste site-walk notes here…"
          />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <WandSparkles className="h-4 w-4 text-primary" />
              Structured JSON · deterministic totals · persistent history
            </div>
            <Button
              size="lg"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(form)}
              className="min-w-48 bg-primary text-primary-foreground shadow-lg shadow-primary/15"
            >
              {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building draft…</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate proposal</>}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LineItemsEditor({ items, disabled, onChange }: { items: ProposalLineItem[]; disabled: boolean; onChange: (items: ProposalLineItem[]) => void }) {
  const update = (index: number, patch: Partial<ProposalLineItem>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  return (
    <div className="overflow-hidden rounded-xl border border-border/80">
      <div className="hidden grid-cols-[1.7fr_.55fr_.55fr_.8fr_32px] gap-3 bg-muted/60 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground md:grid">
        <span>Scope item</span><span>Qty</span><span>Unit</span><span>Unit price</span><span />
      </div>
      {items.map((item, index) => (
        <div key={`${index}-${item.description}`} className="grid gap-3 border-t border-border/70 p-3 first:border-t-0 md:grid-cols-[1.7fr_.55fr_.55fr_.8fr_32px] md:items-center md:px-4">
          <div>
            <Input disabled={disabled} value={item.description} onChange={e => update(index, { description: e.target.value })} className="h-9" />
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{item.category} · {item.sourceNote}</p>
          </div>
          <Input disabled={disabled} type="number" min="0" step="0.1" value={item.quantity} onChange={e => update(index, { quantity: Number(e.target.value) })} className="h-9" />
          <Input disabled={disabled} value={item.unit} onChange={e => update(index, { unit: e.target.value })} className="h-9" />
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-muted-foreground">$</span>
            <Input disabled={disabled} type="number" min="0" step="1" value={item.unitPriceCents / 100} onChange={e => update(index, { unitPriceCents: Math.round(Number(e.target.value) * 100) })} className="h-9 pl-7" />
          </div>
          {!disabled ? (
            <Button variant="ghost" size="icon" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label="Remove line item" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : <span />}
        </div>
      ))}
      {!disabled && (
        <button
          onClick={() => onChange([...items, { category: "Custom", description: "New scope item", quantity: 1, unit: "allowance", unitPriceCents: 100_000, sourceNote: "Added during human review" }])}
          className="flex w-full items-center justify-center gap-2 border-t border-dashed border-border p-3 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" /> Add line item
        </button>
      )}
    </div>
  );
}

function ProposalWorkspace({ proposal, onRefresh }: { proposal: Proposal; onRefresh: (proposal?: Proposal) => void }) {
  const [draft, setDraft] = useState<EditableProposalFields>(() => toEditable(proposal));
  const utils = trpc.useUtils();
  const disabled = proposal.status === "approved";
  const events = trpc.proposal.integrationEvents.useQuery(
    { proposalId: proposal.id },
    { enabled: proposal.status === "approved" },
  );

  useEffect(() => setDraft(toEditable(proposal)), [proposal.id, proposal.version]);

  const update = trpc.proposal.update.useMutation({
    onSuccess: async saved => {
      await utils.proposal.list.invalidate();
      setDraft(toEditable(saved));
      onRefresh(saved);
      toast.success(`Draft saved as version ${saved.version}`);
    },
    onError: error => toast.error("Could not save draft", { description: error.message }),
  });

  const approve = trpc.proposal.approve.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.proposal.list.invalidate(), utils.proposal.integrationEvents.invalidate()]);
      onRefresh(result.proposal);
      toast.success("Approved and delivered", { description: `Outbound event accepted by ${result.delivery.destination}.` });
    },
    onError: error => {
      utils.proposal.list.invalidate();
      toast.error("Approval needs attention", { description: error.message });
    },
  });

  const editedTotal = useMemo(() => draft.lineItems.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPriceCents), 0), [draft.lineItems]);
  const highFlags = draft.riskFlags.filter(flag => flag.severity === "high").length;
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(toEditable(proposal));

  return (
    <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8 lg:py-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge className={disabled ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>
              {disabled ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock3 className="mr-1 h-3 w-3" />}
              {disabled ? "Approved" : "Awaiting approval"}
            </Badge>
            <span className="text-xs text-muted-foreground">Proposal #{proposal.id} · v{proposal.version}</span>
          </div>
          <h1 className="font-display truncate text-3xl font-semibold tracking-tight">{proposal.customerName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{proposal.projectAddress} · {proposal.projectType}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Proposed investment</p>
          <p className="mt-1 font-display text-3xl font-semibold text-primary">{dollars(editedTotal)}</p>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="flow-step complete"><span>1</span><div><b>Captured</b><small>Site-walk notes stored</small></div></div>
        <div className="flow-step complete"><span>2</span><div><b>Drafted</b><small>AI scope + guardrails</small></div></div>
        <div className={`flow-step ${disabled ? "complete" : ""}`}><span>{disabled ? <Check className="h-3.5 w-3.5" /> : "3"}</span><div><b>{disabled ? "Delivered" : "Review & approve"}</b><small>{disabled ? "Webhook event sent" : "Human decision required"}</small></div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card className="border-0 p-5 shadow-soft sm:p-6">
          <Tabs defaultValue="scope">
            <TabsList className="h-10 bg-muted/70">
              <TabsTrigger value="scope">Scope & pricing</TabsTrigger>
              <TabsTrigger value="message">Client message</TabsTrigger>
              <TabsTrigger value="source">Source notes</TabsTrigger>
            </TabsList>
            <TabsContent value="scope" className="mt-5 space-y-6">
              <Field label="Project summary">
                <Textarea disabled={disabled} value={draft.projectSummary} onChange={e => setDraft(current => ({ ...current, projectSummary: e.target.value }))} className="min-h-28 leading-6" />
              </Field>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="section-kicker">Line items</p>
                  <span className="text-xs text-muted-foreground">Totals are calculated server-side</span>
                </div>
                <LineItemsEditor disabled={disabled} items={draft.lineItems} onChange={lineItems => setDraft(current => ({ ...current, lineItems }))} />
                <div className="mt-3 flex items-center justify-end gap-6 rounded-xl bg-primary px-5 py-4 text-primary-foreground">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">Draft total</span>
                  <span className="font-display text-2xl font-semibold">{dollars(editedTotal)}</span>
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Assumptions (one per line)">
                  <Textarea disabled={disabled} value={draft.assumptions.join("\n")} onChange={e => setDraft(current => ({ ...current, assumptions: e.target.value.split("\n").filter(Boolean) }))} className="min-h-36 leading-6" />
                </Field>
                <Field label="Exclusions (one per line)">
                  <Textarea disabled={disabled} value={draft.exclusions.join("\n")} onChange={e => setDraft(current => ({ ...current, exclusions: e.target.value.split("\n").filter(Boolean) }))} className="min-h-36 leading-6" />
                </Field>
              </div>
              <Field label="Open questions (remove resolved items)">
                <Textarea disabled={disabled} value={draft.unansweredQuestions.join("\n")} onChange={e => setDraft(current => ({ ...current, unansweredQuestions: e.target.value.split("\n").filter(Boolean) }))} className="min-h-28 leading-6" />
              </Field>
            </TabsContent>
            <TabsContent value="message" className="mt-5">
              <Field label="Customer-facing cover note">
                <Textarea disabled={disabled} value={draft.customerMessage} onChange={e => setDraft(current => ({ ...current, customerMessage: e.target.value }))} className="min-h-[420px] leading-7" />
              </Field>
            </TabsContent>
            <TabsContent value="source" className="mt-5">
              <div className="rounded-xl bg-[#f6f2e9] p-5 text-sm leading-7 text-foreground/75 whitespace-pre-wrap">{proposal.siteNotes}</div>
            </TabsContent>
          </Tabs>

          {!disabled && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
              <p className="text-xs text-muted-foreground">Generated by {proposal.aiModel} · {proposal.promptTokens?.toLocaleString() || "—"} input / {proposal.completionTokens?.toLocaleString() || "—"} output tokens</p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: proposal.id, ...draft })}>
                  {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save draft
                </Button>
                <Button disabled={approve.isPending || highFlags > 0 || hasUnsavedChanges} onClick={() => approve.mutate({ id: proposal.id })}>
                  {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {hasUnsavedChanges ? "Save changes first" : "Approve & send"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="border-0 p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="section-kicker">Guardrails</p>
              <Badge variant="outline" className={highFlags ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                {highFlags ? `${highFlags} blocking` : "Clear to approve"}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {draft.riskFlags.length === 0 ? (
                <div className="flex gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-xs leading-5">Schema, numeric, and project-range checks passed.</p>
                </div>
              ) : draft.riskFlags.map((flag, index) => (
                <div key={`${flag.message}-${index}`} className={`flex gap-3 rounded-xl p-3 ${flag.severity === "high" ? "bg-red-50 text-red-900" : flag.severity === "medium" ? "bg-amber-50 text-amber-950" : "bg-sky-50 text-sky-900"}`}>
                  {flag.severity === "high" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">{flag.severity}</p><p className="mt-1 text-xs leading-5">{flag.message}</p>
                    {!disabled && <button onClick={() => setDraft(current => ({ ...current, riskFlags: current.riskFlags.filter((_, i) => i !== index) }))} className="mt-2 text-[11px] font-bold underline underline-offset-2">Mark resolved</button>}
                  </div>
                </div>
              ))}
              {!disabled && hasUnsavedChanges && <p className="text-[11px] leading-5 text-muted-foreground">Save draft changes before approval so the server can re-run every guardrail.</p>}
            </div>
          </Card>

          <Card className="border-0 p-5 shadow-soft">
            <p className="section-kicker">Delivery</p>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Webhook className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-semibold">GHL-ready webhook</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Approval emits a structured external event. The assessment uses a redacted live notifier; production swaps in a GHL webhook URL.</p>
              </div>
            </div>
            {disabled && (
              <div className="mt-4 border-t border-border/70 pt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Audit log</p>
                {events.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : events.data?.length ? events.data.map(event => (
                  <div key={event.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /><span>{event.destination}</span></div>
                    <span className="text-muted-foreground">HTTP {event.httpStatus || "—"}</span>
                  </div>
                )) : <p className="text-xs text-muted-foreground">No delivery event recorded.</p>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"workspace" | "new">("workspace");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const list = trpc.proposal.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const proposals = list.data?.proposals ?? [];
  const selected = proposals.find(item => item.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId === null && proposals.length) setSelectedId(proposals[0].id);
  }, [proposals, selectedId]);

  const metrics = list.data?.metrics ?? { totalProposals: 0, awaitingApproval: 0, approved: 0, pipelineValueCents: 0 };

  const chooseProposal = (id: number) => {
    setSelectedId(id);
    setMode("workspace");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="app-header sticky top-0 z-30 flex h-16 items-center justify-between px-4 sm:px-6">
        <button onClick={() => setMode("workspace")} className="flex items-center gap-3 text-left">
          <span className="brand-mark"><Leaf className="h-5 w-5" /></span>
          <span><b className="block font-display text-lg leading-none">QuoteFlow</b><small className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Greenscape Pro</small></span>
        </button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:flex"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live assessment</Badge>
          <Button onClick={() => setMode("new")}><Plus className="mr-2 h-4 w-4" /> New proposal</Button>
        </div>
      </header>

      <div className="app-shell">
        <aside className="pipeline-panel">
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Pipeline" value={dollars(metrics.pipelineValueCents)} helper={`${metrics.totalProposals} proposals`} icon={CircleDollarSign} />
              <Metric label="Review" value={String(metrics.awaitingApproval)} helper={`${metrics.approved} approved`} icon={FileCheck2} />
            </div>
          </div>
          <div className="flex items-center justify-between border-y border-border/70 px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Proposal queue</p>
            {list.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="pipeline-list space-y-1.5 p-3">
            {list.isLoading ? (
              <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : proposals.length ? proposals.map(proposal => (
              <ProposalListItem key={proposal.id} proposal={proposal} active={mode === "workspace" && proposal.id === selectedId} onClick={() => chooseProposal(proposal.id)} />
            )) : (
              <div className="m-2 rounded-2xl border border-dashed border-border p-6 text-center">
                <Inbox className="mx-auto h-6 w-6 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-semibold">No proposals yet</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">The first AI-generated draft will appear here and persist after refresh.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setMode("new")}>Create first draft</Button>
              </div>
            )}
          </div>
          <div className="mt-auto hidden border-t border-border/70 p-4 lg:block">
            <div className="flex items-center gap-3 rounded-xl bg-secondary/70 p-3">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <div><p className="text-xs font-semibold">Target cycle</p><p className="text-[11px] text-muted-foreground">6–9 days <ArrowRight className="inline h-3 w-3" /> same day</p></div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 bg-[#f4f1e9]/60">
          {mode === "new" ? (
            <NewProposalForm onGenerated={proposal => { setSelectedId(proposal.id); setMode("workspace"); }} />
          ) : selected ? (
            <ProposalWorkspace proposal={selected} onRefresh={proposal => proposal && setSelectedId(proposal.id)} />
          ) : (
            <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
              <div className="max-w-md text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><WandSparkles className="h-6 w-6" /></span>
                <h1 className="mt-5 font-display text-3xl font-semibold">Ready for the first site walk.</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Generate a guarded, persistent proposal draft from messy field notes—then review every dollar before anything leaves the system.</p>
                <Button size="lg" className="mt-6" onClick={() => setMode("new")}>Create proposal <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
