"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteAssessmentAction } from "@/features/assessment/actions";

type Props = {
  assessmentId: string;
  title: string;
  answersCount: number;
  linkedTasksCount: number;
};

export function DeleteAssessmentDialog({ assessmentId, title, answersCount, linkedTasksCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === title.trim();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAssessmentAction({ assessmentId, confirmTitle: typed.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Assessment eliminato", {
        description:
          result.data.tasksDetached > 0
            ? `${result.data.tasksDetached} attività restano nel piano di adeguamento, scollegate dal requisito.`
            : undefined,
      });
      setOpen(false);
      router.push("/assessments");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Elimina
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminare l&apos;assessment?</DialogTitle>
          <DialogDescription>
            L&apos;operazione non si può annullare. Se l&apos;assessment non è stato creato per errore, valuta
            di archiviarlo invece di eliminarlo.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            Verranno eliminate <strong>{answersCount}</strong> valutazioni dei requisiti.
          </li>
          <li>
            {linkedTasksCount > 0 ? (
              <>
                <strong>{linkedTasksCount}</strong> attività del piano di adeguamento <strong>restano</strong>
                , ma scollegate dal requisito.
              </>
            ) : (
              "Nessuna attività del piano di adeguamento è collegata."
            )}
          </li>
          <li>L&apos;eliminazione viene registrata nell&apos;audit log.</li>
        </ul>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field>
          <FieldLabel htmlFor="confirm-title">
            Per confermare, digita il titolo dell&apos;assessment
          </FieldLabel>
          <Input
            id="confirm-title"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={title}
            autoComplete="off"
            className="h-9"
          />
          <FieldDescription className="font-mono text-xs">{title}</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Annulla
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={!matches || pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 />}
            Elimina definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
