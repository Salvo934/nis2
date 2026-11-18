import {
  ArrowRight,
  ClipboardList,
  FileBarChart,
  FolderLock,
  Layers,
  ListTodo,
  LockKeyhole,
  ScrollText,
  SearchCheck,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

const modules = [
  {
    icon: ClipboardList,
    title: "Assessment NIS2",
    text: "Valutazione dei requisiti con stato, motivazione, responsabile e data dell'ultima verifica.",
  },
  {
    icon: SearchCheck,
    title: "Gap analysis",
    text: "Le lacune emergono dai risultati dell'assessment e vengono classificate per criticità.",
  },
  {
    icon: ListTodo,
    title: "Piano di adeguamento",
    text: "Attività correttive con priorità, responsabile, scadenza e requisito collegato.",
  },
  {
    icon: FolderLock,
    title: "Evidenze",
    text: "Documenti in archivio privato, versionati e collegati ai requisiti, con accessi tracciati.",
  },
  {
    icon: FileBarChart,
    title: "Report",
    text: "Esportazione PDF con data, versione del catalogo normativo e criteri di calcolo.",
  },
  {
    icon: Layers,
    title: "Multi-organizzazione",
    text: "Più aziende e più ruoli sulla stessa piattaforma, con dati rigorosamente separati.",
  },
];

const principles = [
  {
    icon: ScrollText,
    title: "Catalogo verificato e versionato",
    text: "I requisiti vengono importati da dataset con fonte e versione dichiarate. Nessun obbligo inventato.",
  },
  {
    icon: FileBarChart,
    title: "Metriche trasparenti",
    text: "Ogni indicatore mostra numeratore, denominatore e criterio. Nessuna promessa di certificazione.",
  },
  {
    icon: LockKeyhole,
    title: "Isolamento tra tenant",
    text: "Autorizzazioni applicate dal database con Row Level Security, non solo dall'interfaccia.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <Link href="/login">Accedi</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/signup">Crea account</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_65%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="mb-4 inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Direttiva (UE) 2022/2555 · D.Lgs. 138/2024
            </p>
            <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
              Il percorso di adeguamento NIS2, sotto controllo.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
              NIS2 Control aiuta aziende, consulenti e team IT a valutare i requisiti, individuare le lacune,
              pianificare le attività correttive e raccogliere le evidenze, in un unico spazio di lavoro
              sicuro.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild className="h-10 px-4">
                <Link href="/signup">
                  Inizia ora <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-10 px-4">
                <Link href="/login">Accedi</Link>
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="modules" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="modules" className="text-2xl font-semibold tracking-tight">
            Moduli della piattaforma
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            In sviluppo progressivo: lo stato di ogni modulo è documentato nella roadmap del progetto.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-xl border bg-card p-5">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="principles" className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="principles" className="text-2xl font-semibold tracking-tight">
              Principi di progettazione
            </h2>
            <ul className="mt-8 grid gap-6 md:grid-cols-3">
              {principles.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <Icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} NIS2 Control</span>
          <span>
            Strumento di supporto alla gestione della conformità: non costituisce certificazione né consulenza
            legale.
          </span>
        </div>
      </footer>
    </div>
  );
}
